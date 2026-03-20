const { catchAsync } = require("../utilities/catchAsync");
const sequelize = require("../config/db");
const Tenant = require("../models/tenantModel");
const User = require("../models/userModel");
const AppError = require("../utilities/appError");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const { generateSlug } = require("../utilities/generateTenantSlug");

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createSendToken = ({ user, tenant }, req, res) => {
  const token = signToken(user.id);

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
      tenant, // if tenant obj is passed then it'll will show up in response otherwise ndot
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

  // find user by tenant_slug (from tenant table) and email
  const user = await User.findOne({
    where: { email: userData.email },
    include: [
      {
        model: Tenant,
        attributes: [],
        where: { tenant_slug: userData.tenant_slug },
        required: true,
      },
    ],
  });

  if (!user) return next(new AppError("no user found with this email!", 404));

  // checkPassword
  const matched = await bcrypt.compare(userData.password, user.password);
  if (!matched) return next(new AppError("passoword is invalid!", 400));

  // login the user
  createSendToken({ user }, req, res);
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
    // sync the db first
    await sequelize.sync();

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

  // check if user still there
  const user = await User.findByPk(matched.id);

  if (!user)
    return next(
      new AppError("user belongs to this token, no longer exist!", 400),
    );

  // check if he changed password after token issued ( pending )

  // grant user acess
  req.user = user;
  res.locals.user = user;
  next();
});
