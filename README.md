# Prayer Partner

A place to edit and store your prayer requests, and to see which ones have been answered.

## Requirements

- Node.js version used: v16.16.0
- Browsers used for testing: Safari Version 16.5 (18615.2.9.11.4), Google Chrome Version 116.0.5845.96
- PostgreSQL version used: PostgreSQL 15.3

## Installation

- Create a new directory
- Unzip prayer-partner.zip into the directory and navigate to it
- Run 'npm install' to install dependencies

## Setup

- Create a PostgreSQL database named 'prayer-partner' by entering 'createdb prayer-partner' from the terminal
- Connect to the database from the terminal using 'psql -d prayer-partner'
- Import the tables using the command '\i (insert path of the schema.sql file here)'
  - For example: '\i /Users/johndoe/Documents/projects/prayer-partner/schema.sql'
- To load seed data for testing, import 'lib/users.sql', then 'seed-data.sql' using the same method described above

## Usernames and passwords for seed users

- Matt: launchschool
- Victoria: secret
- Taylor: Swift

## Running the Application

- To start the application, run 'npm start'
- The application will be accessible at: `http://localhost:3000`

## Additional Details

- Prayer requests are topics that the user wishes to keep track of while praying for them. 
- Prayer requests belong to various categories that the user can edit.
- Clicking on a category brings up prayer requests which the user can reference to make sure they remember to pray for them.
- Once a request is answered, the user can mark it as answered and it will be moved to a seprate page.
- The page containing answered prayer requests for each category can be used as a reminder of answered prayers.
- Each user's account is private, and they can create categories with the same name as other users, but each user's categories must be unique for that user.