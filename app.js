const config = require("./lib/config");
const express = require("express");
const morgan = require("morgan");
const flash = require("express-flash");
const session = require("express-session");
const { body, query, validationResult } = require("express-validator");
const store = require("connect-loki");
const PgPersistence = require("./lib/pg-persistence");
const catchError = require("./lib/catch-error");

const app = express();
const host = config.HOST;
const port = config.PORT;
const LokiStore = store(session);
const ITEMS_PER_PAGE = 5;

app.set("views", "./views");
app.set("view engine", "pug");

app.use(morgan("common"));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  cookie: {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in millseconds
    path: "/",
    secure: false,
  },
  name: "launch-school-prayer-partner-session-id",
  resave: false,
  saveUninitialized: true,
  secret: config.SECRET,
  store: new LokiStore({}),
}));

app.use(flash());

// Create a new datastore
app.use((req, res, next) => {
  res.locals.store = new PgPersistence(req.session);
  next();
});

// Extract session info
app.use((req, res, next) => {
  res.locals.username = req.session.username;
  res.locals.signedIn = req.session.signedIn;
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

// Detect unauthorized access to routes.
const requiresAuthentication = (req, res, next) => {
  if (!res.locals.signedIn) {
    req.session.redirectTo = req.originalUrl;
    res.redirect(302, "/users/signin");
  } else {
    next();
  }
};

//Temporary
app.get('/pp', (req, res) => {
  res.send('This is the /pp route.');
});

// Redirect start page
app.get("/", (req, res) => {
  res.redirect("/categories");
});

// Render the list of categories
app.get("/categories",
  requiresAuthentication,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Invalid page number.")
  ],
  catchError(async (req, res) => {
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.redirect("/categories");
    } else {
      let categories = await res.locals.store.sortedCategories();
      const currentPage = parseInt(req.query.page) || 1;
      const numberOfItems = categories.length;
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;

      categories = await res.locals.store.paginatedCategories(ITEMS_PER_PAGE, offset);

      res.render("categories", { categories, currentPage, numberOfItems, ITEMS_PER_PAGE });
    }
  })
);

// Render category creation page
app.get("/categories/new",
  requiresAuthentication,
  (req, res) => {
    res.render("new-category");
  }
);

// Render individual category and its unanswered prayer requests
app.get("/categories/:categoryId",
  requiresAuthentication,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Invalid page number.")
  ],
  catchError(async (req, res) => {
    let categoryId = req.params.categoryId;
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.redirect(`/categories/${categoryId}`);
    } else {
      let category = await res.locals.store.loadCategory(+categoryId);
      if (category === undefined) {
        req.flash("error", "Category not found.");
        return res.redirect("/categories");
      } 
      const currentPage = parseInt(req.query.page) || 1;
      const numberOfItems = category.prayerRequests.filter((request => !request.answered)).length;
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      category.prayerRequests = await res.locals.store.unansweredPrayerRequests(category, ITEMS_PER_PAGE, offset);

      res.render("category", { category, currentPage, numberOfItems, ITEMS_PER_PAGE });
    }
  })
);

// Render a list of answered prayers for a given category
app.get("/categories/:categoryId/answered",
  requiresAuthentication,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Invalid page number.")
  ],
  catchError(async (req, res) => {
    let categoryId = req.params.categoryId;
    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.redirect(`/categories/${categoryId}/answered`);
    } else {
      let category = await res.locals.store.loadCategory(+categoryId);
      if (category === undefined) {
        req.flash("error", "Category not found.");
        return res.redirect("/categories");
      }

      const currentPage = parseInt(req.query.page) || 1;
      const numberOfItems = category.prayerRequests.filter((request => request.answered)).length;
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      category.answeredPrayerRequests = await res.locals.store.answeredPrayerRequests(category, ITEMS_PER_PAGE, offset);

      res.render("answered", { category, currentPage, numberOfItems, ITEMS_PER_PAGE });
    }
  })
);

// Create a new prayer request and add it to the specified category
app.post("/categories/:categoryId/prayerrequests",
  requiresAuthentication,
  [
    body("prayerRequestTitle")
      .trim()
      .isLength({ min: 1, max: 70 })
      .withMessage("Prayer request must be between 1 and 70 characters."),
  ],
  catchError(async (req, res) => {
    let prayerRequestTitle = req.body.prayerRequestTitle;
    let categoryId = req.params.categoryId;

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));

      let category = await res.locals.store.loadCategory(+categoryId);
      if (category === undefined) {
        req.flash("error", "Category not found.");
        return res.redirect("/categories");
      } 

      category.prayerRequests = await res.locals.store.unansweredPrayerRequests(category);

      res.render("category", {
        category,
        prayerRequestTitle,
        flash: req.flash(),
      });
    } else {
      let created = await res.locals.store.createPrayerRequest(+categoryId, prayerRequestTitle);
      if (!created) {
        req.flash("error", "Error creating prayer request.");
      } else {
        req.flash("success", `Prayer request added.`);
      } 
      res.redirect(`/categories/${categoryId}`);
    }
  })
);

// Create a new category
app.post("/categories",
  requiresAuthentication,
  [
    body("categoryTitle")
      .trim()
      .isLength({ min: 1, max: 70})
      .withMessage("Category title must be between 1 and 70 characters."),
  ],
  catchError(async (req, res) => {
    let store = res.locals.store;
    let categoryTitle = req.body.categoryTitle;

    const rerenderNewCategory = () => {
      res.render("new-category", {
        categoryTitle,
        flash: req.flash(),
      });
    };

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      rerenderNewCategory();
    } else if (await store.existsCategoryTitle(categoryTitle)) {
      req.flash("error", "The category title must be unique.");
      rerenderNewCategory();
    } else {
      let created = await store.createCategory(categoryTitle);
      if (!created) {
        req.flash("error", "Error creating category.");
      } else {
        req.flash("success", "The category has been created.");
      }
      res.redirect("/categories");
    }
  })
);

// Mark a prayer request as answered
app.post("/categories/:categoryId/prayerrequests/:prayerRequestId/answer",
  requiresAuthentication,
  catchError(async (req, res) => {
    let { categoryId, prayerRequestId } = req.params;
    let answered = await res.locals.store.answerPrayerRequest(+prayerRequestId);
    if (!answered) {
      req.flash("error", "Prayer request not found.");
    } else {
      req.flash("success", "The prayer request has been moved to 'Answered Prayer Requests.'");
    }
    res.redirect(`/categories/${categoryId}`);
  })
);

// Delete a prayer request from the category
app.post("/categories/:categoryId/prayerrequests/:prayerRequestId/delete",
  catchError(async (req, res) => {
    let { categoryId, prayerRequestId } = req.params;
    let deleted = await res.locals.store.deletePrayerRequest(+prayerRequestId);
    if (!deleted) {
      req.flash("error", "Prayer request not found.");
    } else {
      req.flash("success", "The prayer request has been deleted.");
    }
    res.redirect(`/categories/${categoryId}`);
  })
);

// Delete an answered prayer request
app.post("/categories/:categoryId/prayerrequests/:prayerRequestId/deleteanswered",
  catchError(async (req, res) => {
    let { categoryId, prayerRequestId } = req.params;
    let deleted = await res.locals.store.deletePrayerRequest(+prayerRequestId);
    if (!deleted) {
      req.flash("error", "Prayer request not found.");
    } else {
      req.flash("success", "The answered prayer request has been deleted.");
    }
    res.redirect(`/categories/${categoryId}/answered`);
  })
);

// Render category edit form
app.get("/categories/:categoryId/edit",
  requiresAuthentication,
  catchError(async (req, res) => {
    let categoryId = req.params.categoryId;
    let category = await res.locals.store.loadCategory(+categoryId);
    if (!category) {
      req.flash("error", "Category not found.");
      return res.redirect("/categories");
    }
    res.render("edit-category", { category });
  })
);

// Delete category
app.post("/categories/:categoryId/delete",
  requiresAuthentication,
  catchError(async (req, res) => {
    let categoryId = req.params.categoryId;
    let deleted = await res.locals.store.deleteCategory(+categoryId);
    if (!deleted) {
      req.flash("error", "Category not found.");
    } else {
      req.flash("success", "Category deleted.");
    }
    res.redirect("/categories");
  })
);

// Edit category title
app.post("/categories/:categoryId/edit",
  requiresAuthentication,
  [
    body("categoryTitle")
      .trim()
      .isLength({ min: 1, max: 70 })
      .withMessage("Category title must be between 1 and 70 characters."),
  ],
  catchError(async (req, res) => {
    let store = res.locals.store;
    let categoryId = req.params.categoryId;
    let categoryTitle = req.body.categoryTitle;

    const rerenderEditCategory = async () => {
      let category = await store.loadCategory(+categoryId);
      if (!category) {
        req.flash("error", "Category not found.");
        return res.redirect("/categories");
      }

      res.render("edit-category", {
        categoryTitle,
        category,
        flash: req.flash(),
      });
    };

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      rerenderEditCategory();
    } else if (await store.existsCategoryTitle(categoryTitle)) {
      req.flash("error", "The category title must be unique.");
      rerenderEditCategory();
    } else {
      let updated = await store.setCategoryTitle(+categoryId, categoryTitle);
      if (!updated) {
        req.flash("error", "Error updating category title");
      } else {
        req.flash("success", "Category updated.");
      }
      res.redirect(`/categories/${categoryId}`);
    }
  })
);

// Render prayer request edit form
app.get("/categories/:categoryId/prayerrequests/:prayerRequestId/edit",
  requiresAuthentication,
  catchError(async (req, res) => {
    let { categoryId, prayerRequestId } = req.params;
    let category = await res.locals.store.loadCategory(+categoryId);
    let prayerRequest = await res.locals.store.loadPrayerRequest(+categoryId, +prayerRequestId);
    if (!prayerRequest) {
      req.flash("error", "Prayer request not found.");
      return res.redirect(`/categories/${categoryId}`);
    }

    res.render("edit-prayer-request", { 
      category,
      prayerRequest 
    });
  })
);

// Edit prayer request title
app.post("/categories/:categoryId/prayerrequests/:prayerRequestId/edit",
  requiresAuthentication,
  [
    body("prayerRequestTitle")
      .trim()
      .isLength({ min: 1, max: 70 })
      .withMessage("Prayer request title must be between 1 and 70 characters."),
  ],
  catchError(async (req, res) => {
    let store = res.locals.store;
    let { categoryId, prayerRequestId } = req.params;
    let prayerRequestTitle = req.body.prayerRequestTitle;

    let errors = validationResult(req);
    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      let category = await store.loadCategory(+categoryId);
      let prayerRequest = await store.loadPrayerRequest(+categoryId, +prayerRequestId);
      if (!prayerRequest) {
        req.flash("error", "Prayer request not found.");
        return res.redirect(`/categories/${categoryId}`);
      }

      res.render("edit-prayer-request", {
        prayerRequestTitle,
        prayerRequest,
        category,
        flash: req.flash(),
      });
    } else {
      let updated = await store.setPrayerRequestTitle(+prayerRequestId, prayerRequestTitle);
      if (!updated) {
        req.flash("error", "Error updating prayer request title.");
      } else {
        req.flash("success", "Prayer request title updated.");
      }   
      res.redirect(`/categories/${categoryId}`);
    }
  })
);

// Render the Sign In page.
app.get("/users/signin", (req, res) => {
  req.flash("info", "Please sign in or create a new account.");
  res.render("signin", {
    flash: req.flash(),
  });
});

// Handle Sign In form submission
app.post("/users/signin",
  catchError(async (req, res) => {
    let username = req.body.username.trim();
    let password = req.body.password;

    let authenticated = await res.locals.store.authenticate(username, password);
    if (!authenticated) {
      req.flash("error", "Invalid credentials.");
      res.render("signin", {
        flash: req.flash(),
        username: req.body.username,
      });
    } else {
      let session = req.session;
      session.username = username;
      session.signedIn = true;

      let redirectTo = session.redirectTo || "/categories";
      delete session.redirectTo;

      req.flash("info", "Welcome!");
      res.redirect(redirectTo);
    }
  })
);

// Handle Sign Out
app.post("/users/signout", (req, res) => {
  delete req.session.username;
  delete req.session.signedIn;
  res.redirect("/users/signin");
});

// Render account creation page
app.get("/users/createaccount", (req, res) => {
    res.render("new-account");
});

// Handle account creation form submission
app.post("/users/createaccount",
  [
    body("username")
      .trim()
      .isLength({ min: 1, max: 70})
      .withMessage("Username must be between 1 and 70 characters."),

    body("password")
      .isLength({ min: 1, max: 70})
      .withMessage("Password must be between 1 and 70 characters."),
  ],
  catchError(async (req, res) => {
    let errors = validationResult(req);
    let username = req.body.username.trim();
    let password = req.body.password;

    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.render("new-account", {
        username,
        flash: req.flash(),
      });
    } else {
      let created = await res.locals.store.createAccount(username, password);
      if (!created) {
        req.flash("error", "Username already taken.");
        res.render("new-account", {
          flash: req.flash(),
          username: req.body.username,
        });
      } else {
        let session = req.session;
        session.username = username;
        session.signedIn = true;
        req.flash("success", "New account created.");
        res.redirect("/categories");
      }
    }
  })
);

// Render account edit form
app.get("/users/edit",
  requiresAuthentication,
  (req, res) => {
    res.render("edit-account");
});

// Delete user
app.post("/users/delete",
  requiresAuthentication,
  catchError(async (req, res) => {
    let deleted = await res.locals.store.deleteAccount();
    if (!deleted) {
      req.flash("error", "error deleting account.");
    } else {
      delete req.session.username;
      delete req.session.signedIn;
      req.flash("success", "Account deleted.");
    }
    res.redirect("/users/signin");
  })
);

// Edit account
app.post("/users/edit",
  requiresAuthentication,
  [
    body("password")
      .isLength({ min: 1, max: 70})
      .withMessage("Password must be between 1 and 70 characters."),
  ],
  catchError(async (req, res) => {
    let errors = validationResult(req);
    let password = req.body.password;

    if (!errors.isEmpty()) {
      errors.array().forEach(message => req.flash("error", message.msg));
      res.render("edit-account", {
        flash: req.flash(),
      });
    } else {
      let updated = await res.locals.store.editAccount(password);
      if (!updated) {
        req.flash("error", "error updating password.");
      } else {
        req.flash("success", "Password updated.");
      }
      res.redirect(`/categories`);
    }
  })
);

// Error handler
app.use((err, req, res, _next) => {
  console.log(err);
  res.status(404).send(err.message);
});

// Listener
app.listen(port, host, () => {
  console.log(`Prayer Partner is listening on port ${port} of ${host}!`);
});
