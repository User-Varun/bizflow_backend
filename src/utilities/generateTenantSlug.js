const { randomUUID } = require("crypto");

exports.generateSlug = (name) => {
  const cleanName =
    String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tenant";

  return "bizflow-" + cleanName + "-" + randomUUID().slice(0, 8);
};
