## AppError

- Use `Error.captureStackTrace(this, this.constructor)` inside `AppError`.

## Unique Email Per Tenant (Not Global)

- Sequelize supports composite unique indexes.
- This lets the same email exist in different tenants, but not twice in the same tenant.

```js
indexes: [
  {
    unique: true,
    fields: ["tenant_id", "email"], // same email allowed across tenants, blocked within one tenant
  },
];
```

## Transaction in Sequelize

```js
const { tenant, user } = await sequelize.transaction(async (transaction) => {
  // sync the db first
  await sequelize.sync();

  // create tenant
  const tenant = await Tenant.create(companyDetails, { transaction });

  // create owner user
  const user = await User.create(
    {
      tenant_id: tenant.id,
      email: userDetails.email,
      password_hash: userDetails.password,
      role: "owner",
    },
    { transaction },
  );

  // update owner in tenant table
  await tenant.update({ owner_user_id: user.id }, { transaction });

  return { tenant, user };
});
```

## Express Cookies

- Set cookie: `res.cookie(name, token, optionsObj)`
- Read cookie: `req.cookies.name`

Note:

- Do not forget to add cookie parser middleware:
  - `npm i cookie-parser`
  - `app.use(cookieParser())`
