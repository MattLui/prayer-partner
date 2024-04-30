require("dotenv").config();
const mongoose = require("mongoose");

const prayerRequestSchema = new mongoose.Schema({
  username: String,
  categoryId: Number,
  title: String,
});

const PrayerRequest = mongoose.model("PrayerRequest", prayerRequestSchema);

module.exports = {
  async mongoDbCopy(username, categoryId, title) {
    const url = process.env.MONGODB_URI;

    mongoose.set("strictQuery", false);
    mongoose.connect(url);

    const prayerRequest = new PrayerRequest({
      username: username,
      categoryId: categoryId,
      title: title,
    });

    prayerRequest.save().then((result) => {
      console.log("prayer request saved to mongodb");
      mongoose.connection.close();
    });
  },
};
