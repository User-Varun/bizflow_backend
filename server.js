require("dotenv").config({ path: "./config.env" });
const app = require("./src/app");
const sequelize = require("./src/config/db");

const port = process.env.PORT;

app.listen(port, async () => {
  try {
    await sequelize.authenticate();
    console.log("DB connected successfully!");
    console.log("server listening at port " + port);
  } catch (err) {
    console.log(err.message);
    sequelize.close();
  }
});
