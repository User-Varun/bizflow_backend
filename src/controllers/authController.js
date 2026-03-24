const { catchAsync } = require("../utilities/catchAsync");
const sequelize = require("../config/db");
const Tenant = require("../models/tenantModel");
const User = require("../models/userModel");
const AppError = require("../utilities/appError");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const { generateSlug } = require("../utilities/generateTenantSlug");

const signToken = (userId, tenantId) => {
  return jwt.sign({ userId, tenantId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createSendToken = ({ user, tenant }, req, res) => {
  const token = signToken(user.id, tenant.id);

  res.cookie("jwt", token, {
    expires: new Date(
      Date.now() +
        process.env.JWT_EXPIRES_IN.split("d")[0] * 24 * 60 * 60 * 1000,
    ),
    httpOnly: true,
    secure: req.secure || req.headers["x-forwarded-proto"] === "https",
  });

  // hide password
  user.password = undefined;

  res.status(200).json({
    status: "success",
    token,
    data: {
      tenant,
      user,
    },
  });
};

exports.login = catchAsync(async (req, res, next) => {
  const userData = {
    tenant_slug: req.body.tenant_slug,
    email: req.body.email,
    password: req.body.password,
  };

  if (!userData.email || !userData.password || !userData.tenant_slug)
    return next(new AppError("invalid email or password or slug!", 400));

  const tenant = await Tenant.findOne({
    where: { tenant_slug: userData.tenant_slug },
  });

  if (!tenant)
    return next(
      new AppError(
        `no tenant found with the tenant code ${req.body.tenant_slug}`,
        404,
      ),
    );

  // find user by email and tenant id
  const user = await User.findOne({
    where: { email: userData.email, tenant_id: tenant.id },
  });

  if (!user) return next(new AppError("no user found with this email!", 404));

  // checkPassword
  const matched = await bcrypt.compare(userData.password, user.password);
  if (!matched) return next(new AppError("passoword is invalid!", 400));

  // login the user
  createSendToken({ user, tenant }, req, res);
});
exports.register = catchAsync(async (req, res, next) => {
  // register flow

  const companyDetails = {
    cname: req.body.cname, // company name
    caddress: req.body.caddress,
    cphone_number: req.body.cphone_number,
    gstin: req.body.gstin,
  };

  const userDetails = {
    email: req.body.email,
    password: req.body.password,
  };

  if (
    !companyDetails.cname ||
    !companyDetails.caddress ||
    !companyDetails.cphone_number ||
    !companyDetails.gstin ||
    !userDetails.email ||
    !userDetails.password
  ) {
    return next(new AppError("invalid details", 400));
  }

  // add the slug
  companyDetails.tenant_slug = generateSlug(req.body.cname);

  const { tenant, user } = await sequelize.transaction(async (transaction) => {
    // creates tenant
    const tenant = await Tenant.create(companyDetails, { transaction });

    // hash the passowrd using bcrypt
    const hashed_password = await bcrypt.hash(userDetails.password, 12);

    // creates user
    const user = await User.create(
      {
        tenant_id: tenant.id,
        email: userDetails.email,
        password: hashed_password,
        role: "owner",
      },
      { transaction },
    );

    // updates owner in tenant table
    await tenant.update({ owner_user_id: user.id }, { transaction });

    return { tenant, user };
  });

  createSendToken({ user, tenant }, req, res);
});
exports.logout = (_req, res, _next) => {
  // reset the token
  res.cookie("jwt", "loggedOut", {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.status(200).json({
    status: "success",
  });
};

exports.protect = catchAsync(async (req, res, next) => {
  // check the token (in cookie or header )
  let token;
  if (req.cookies.jwt) token = req.cookies.jwt;

  if (!token)
    return next(new AppError("You are not logged in!, try again.", 400));

  // verify the token
  const matched = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  if (!matched)
    return next(new AppError("token expired! Please log in again.", 400));

  // check if tenant and user still there
  const tenant = await Tenant.findByPk(matched.tenantId);
  const user = await User.findOne({
    where: { id: matched.userId, tenant_id: matched.tenantId },
  });

  if (!user || !tenant)
    return next(
      new AppError(
        "user or tenant belongs to this token, no longer exist!",
        400,
      ),
    );

  // check if he changed password after token issued ( pending )

  // grant user acess
  req.user = user;
  req.tenant = tenant;
  // res.locals.user = user;
  // res.locals.tenant = tenant;
  next();
});
