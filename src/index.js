const cookieParser = require("cookie-parser");
require("dotenv").config({ path: "variables.env" });
const createServer = require("./createServer");
const db = require("./db");
const jwt = require("jsonwebtoken");

const server = createServer();

server.express.use(cookieParser());

// Decode jwt to get user ID on each request
server.express.use((req, res, next) => {
  const { token } = req.cookies;

  if (token) {
    const { userId } = jwt.verify(token, process.env.APP_SECRET);

    req.userId = userId;
  }

  next();
});

server.start(
  {
    cors: {
      credentials: true,
      origin: process.env.FRONTEND_URL
    }
  },
  deets => {
    console.log(`Server running on port http://localhost:${deets.port}`);
  }
);
