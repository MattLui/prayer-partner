CREATE TABLE users (
  username text PRIMARY KEY,
  password text NOT NULL
);

CREATE TABLE categories (
  id serial PRIMARY KEY,
  title text NOT NULL,
  username text 
    NOT NULL
    REFERENCES users (username) 
    ON DELETE CASCADE
);

CREATE TABLE prayer_requests (
  id serial PRIMARY KEY,
  title text NOT NULL,
  answered boolean NOT NULL DEFAULT false,
  username text NOT NULL,
  category_id integer
    NOT NULL
    REFERENCES categories (id)
    ON DELETE CASCADE
);