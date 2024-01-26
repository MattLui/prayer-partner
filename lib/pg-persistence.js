const { dbQuery } = require("./db-query");
const bcrypt = require("bcrypt");
const { mongoDbCopy } = require("./mongodb")

module.exports = class PgPersistence {
  constructor(session) {
    this.username = session.username;
  }

  async authenticate(username, password) {
    const FIND_HASHED_PASSWORD = "SELECT password FROM users" +
                                 "  WHERE username = $1";

    let result = await dbQuery(FIND_HASHED_PASSWORD, username);
    if (result.rowCount === 0) return false;

    return bcrypt.compare(password, result.rows[0].password);
  }

  async createAccount(username, password) {
    const CREATE_ACCOUNT = "INSERT INTO users (username, password)" +
                           "  VALUES ($1, $2)";
    try {
      const hashed = await bcrypt.hash(password, 10);

      let result = await dbQuery(CREATE_ACCOUNT, username, hashed);
      return result.rowCount > 0;
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  isUniqueConstraintViolation(error) {
    return /duplicate key value violates unique constraint/.test(String(error));
  }

  async deleteAccount() {
    const DELETE_ACCOUNT = "DELETE FROM users" +
                           "  WHERE username = $1";

    let result = await dbQuery(DELETE_ACCOUNT, this.username);
    return result.rowCount > 0;
  }

  async editAccount(password) {
    const EDIT_ACCOUNT = "UPDATE users" +
                         "  SET password = $1" +
                         "  WHERE username = $2"
    
    const hashed = await bcrypt.hash(password, 10);

    let result = await dbQuery(EDIT_ACCOUNT, hashed, this.username);
    return result.rowCount > 0;
  }

  async setCategoryTitle(categoryId, title) {
    const UPDATE_TITLE = "UPDATE categories" +
                         "  SET title = $1" +
                         "  WHERE id = $2 AND username = $3";

    let result = await dbQuery(UPDATE_TITLE, title, categoryId, this.username);
    return result.rowCount > 0;
  }

  async createPrayerRequest(categoryId, title) {
    const CREATE_PRAYER_REQUEST = "INSERT INTO prayer_requests" +
                        "  (title, category_id, username)" +
                        "  VALUES ($1, $2, $3)";

    let result = await dbQuery(CREATE_PRAYER_REQUEST, title, categoryId, this.username);
    await mongoDbCopy(this.username, categoryId, title);
    return result.rowCount > 0;
  }

  async createCategory(title) {
    const CREATE_CATEGORY = "INSERT INTO categories (title, username)" +
                            "  VALUES ($1, $2)";

    try {
      let result = await dbQuery(CREATE_CATEGORY, title, this.username);
      return result.rowCount > 0;
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) return false;
      throw error;
    }
  }

  async deletePrayerRequest(prayerRequestId) {
    const DELETE_PRAYER_REQUEST = "DELETE FROM prayer_requests" +
                                  "  WHERE id = $1 AND username = $2";

    let result = await dbQuery(DELETE_PRAYER_REQUEST, prayerRequestId, this.username);
    return result.rowCount > 0;
  }

  async deleteCategory(categoryId) {
    const DELETE_CATEGORY = "DELETE FROM categories" +
                            "  WHERE id = $1 AND username = $2";

    let result = await dbQuery(DELETE_CATEGORY, categoryId, this.username);
    return result.rowCount > 0;
  }

  async existsCategoryTitle(title) {
    const FIND_CATEGORY = "SELECT null FROM categories" +
                          "  WHERE title = $1 AND username = $2";

    let result = await dbQuery(FIND_CATEGORY, title, this.username);
    return result.rowCount > 0;
  }

  async loadPrayerRequest(categoryId, prayerRequestId) {
    const FIND_PRAYER_REQUEST = "SELECT * FROM prayer_requests" +
                                "  WHERE category_id = $1 AND id = $2 AND username = $3";

    let result = await dbQuery(FIND_PRAYER_REQUEST, categoryId, prayerRequestId, this.username);
    return result.rows[0];
  }

  async loadCategory(categoryId) {
    const FIND_CATEGORY = "SELECT * FROM categories" +
                          "  WHERE id = $1 AND username = $2";
    const FIND_PRAYER_REQUESTS = "SELECT * FROM prayer_requests" +
                                 "  WHERE category_id = $1 and username = $2";

    let resultCategory = dbQuery(FIND_CATEGORY, categoryId, this.username);
    let resultPrayerRequests = dbQuery(FIND_PRAYER_REQUESTS, categoryId, this.username);
    let resultBoth = await Promise.all([resultCategory, resultPrayerRequests]);

    let category = resultBoth[0].rows[0];
    if (!category) return undefined;

    category.prayerRequests = resultBoth[1].rows;

    return category;
  }

  async setCategoryTitle(categoryId, title) {
    const UPDATE_TITLE = "UPDATE categories" +
                         "  SET title = $1" +
                         "  WHERE id = $2 AND username = $3";

    let result = await dbQuery(UPDATE_TITLE, title, categoryId, this.username);
    return result.rowCount > 0;
  }

  async setPrayerRequestTitle(prayerRequestId, title) {
    const UPDATE_TITLE = "UPDATE prayer_requests" +
                         "  SET title = $1" +
                         "  WHERE id = $2 AND username = $3";

    let result = await dbQuery(UPDATE_TITLE, title, prayerRequestId, this.username);
    return result.rowCount > 0;
  }

  async sortedCategories() {
    const ALL_CATEGORIES = "SELECT * FROM categories" +
                          "  WHERE username = $1" +
                          "  ORDER BY lower(title) ASC";
    const ALL_PRAYER_REQUESTS =     "SELECT * FROM prayer_requests" +
                          "  WHERE username = $1";

    let resultCategories = dbQuery(ALL_CATEGORIES, this.username);
    let resultPrayerRequests = dbQuery(ALL_PRAYER_REQUESTS, this.username);
    let resultBoth = await Promise.all([resultCategories, resultPrayerRequests]);

    let allCategories = resultBoth[0].rows;
    let allPrayerRequests = resultBoth[1].rows;
    if (!allCategories || !allPrayerRequests) return undefined;

    allCategories.forEach(category => {
      category.prayerRequests = allPrayerRequests.filter(prayerRequest => {
        return category.id === prayerRequest.category_id;
      });
    });

    return allCategories;
  }

  answeredPrayerRequests(category, limit, offset) {
    return this.paginatedPrayerRequests(category, limit, offset, true);
  }

  unansweredPrayerRequests(category, limit, offset) {
    return this.paginatedPrayerRequests(category, limit, offset, false);
  }

  async paginatedPrayerRequests(category, limit, offset, answered) {
    const SORTED_PRAYER_REQUESTS = "SELECT * FROM prayer_requests" +
                                   "  WHERE category_id = $1 AND username = $2 AND answered = $3" +
                                   "  ORDER BY lower(title) ASC" +
                                   "  LIMIT $4 OFFSET $5";

    let result = await dbQuery(SORTED_PRAYER_REQUESTS, category.id, this.username, answered, limit, offset);
    return result.rows;
  }

  async paginatedCategories(limit, offset) {
    const PAGINATED_CATEGORIES = "SELECT * FROM categories" +
                                 "  WHERE username = $1" +
                                 "  ORDER BY lower(title) ASC" +
                                 "  LIMIT $2 OFFSET $3";
    let result = await dbQuery(PAGINATED_CATEGORIES, this.username, limit, offset);
    return result.rows;
  }

  async answerPrayerRequest(prayerRequestId) {
    const ANSWER_PRAYER_REQUEST = "UPDATE prayer_requests SET answered = true" +
                                  "  WHERE id = $1" +
                                  "    AND username = $2";

    let result = await dbQuery(ANSWER_PRAYER_REQUEST, prayerRequestId, this.username);
    return result.rowCount > 0;
  }
};
