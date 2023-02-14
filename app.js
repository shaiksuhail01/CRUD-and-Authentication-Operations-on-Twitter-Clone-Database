const express = require("express");
const app = express();
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
app.use(express.json());
module.exports = app;

const db_path = path.join(__dirname, "twitterClone.db");
let db = null;
const initalizeDbAndServer = async () => {
  try {
    db = await open({
      filename: db_path,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running!");
    });
  } catch (error) {
    console.log(`Database Error ${error.message}`);
    process.exit(1);
  }
};
initalizeDbAndServer();

//MiddleWare Function 1

const authentication = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "shaiksuhail", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//MiddleWare Function 2
const getUserId = async (request, response, next) => {
  const { username } = request;
  const getUserIdQuery = `SELECT * FROM user WHERE username='${username}';`;
  const getUser = await db.get(getUserIdQuery);
  const userId = getUser.user_id;
  request.userId = userId;
  next();
};

//MiddleWare Function 3
const checkTweet = async (request, response, next) => {
  const { tweetId } = request.params;
  const intTweetId = parseInt(tweetId);
  const { userId } = request;
  const checkFollowingQuery = `SELECT tweet.tweet_id AS tweet_id
    FROM user INNER JOIN follower ON user.user_id=follower.following_user_id
    INNER JOIN tweet ON tweet.user_id=user.user_id
    WHERE follower.follower_user_id=${userId};`;
  const tweetsList = await db.all(checkFollowingQuery);
  const tweetsListData = [];
  tweetsList.map((obj) => tweetsListData.push(obj.tweet_id));
  if (tweetsListData.includes(intTweetId) === false) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};
//API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const checkUserDetailsQuery = `SELECT * FROM user WHERE username='${username}'`;
  const getUserDetails = await db.get(checkUserDetailsQuery);
  if (getUserDetails === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}'
        )`;
      await db.run(createUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserDetailsQuery = `SELECT * FROM user WHERE username='${username}';`;
  const getUserDetails = await db.get(getUserDetailsQuery);
  if (getUserDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordCorrect = await bcrypt.compare(
      password,
      getUserDetails.password
    );
    if (isPasswordCorrect === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "shaiksuhail");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3

app.get(
  "/user/tweets/feed/",
  authentication,
  getUserId,
  async (request, response) => {
    const { userId } = request;
    const getLatestTweetsQuery = `SELECT user.username, tweet.tweet, tweet.date_time AS dateTime
    FROM user INNER JOIN follower ON user.user_id=follower.following_user_id
    INNER JOIN tweet ON tweet.user_id=follower.following_user_id
    WHERE follower.follower_user_id=${userId}
    ORDER BY tweet.date_time DESC
    LIMIT 4;`;
    const getLatestTweets = await db.all(getLatestTweetsQuery);
    response.send(getLatestTweets);
  }
);

//API 4

app.get(
  "/user/following/",
  authentication,
  getUserId,
  async (request, response) => {
    const { userId } = request;
    const getNamesQuery = `SELECT user.name AS name
    FROM user INNER JOIN follower ON user.user_id=follower.following_user_id
    WHERE follower.follower_user_id=${userId};`;
    const getNames = await db.all(getNamesQuery);
    response.send(getNames);
  }
);

//API 5

app.get(
  "/user/followers/",
  authentication,
  getUserId,
  async (request, response) => {
    const { userId } = request;
    const getNamesQuery = `SELECT user.name AS name
    FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id
    WHERE follower.following_user_id=${userId};`;
    const getNames = await db.all(getNamesQuery);
    response.send(getNames);
  }
);

//API 6

app.get(
  "/tweets/:tweetId/",
  authentication,
  getUserId,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    const followingUserQuery = `SELECT user.user_id FROM user
    INNER JOIN follower ON user.user_id=follower.following_user_id
    WHERE follower.follower_user_id=${userId};`;
    const dbResponse = await db.all(followingUserQuery);
    let followingUserIds = [];
    dbResponse.map((obj) => followingUserIds.push(obj.user_id));
    const getTweetQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
    const tweetDetails = await db.get(getTweetQuery);
    if (followingUserIds.includes(tweetDetails.user_id)) {
      const tweetReplyQuery = `SELECT COUNT(tweet.tweet_id) AS repliesCount
        FROM tweet INNER JOIN reply ON tweet.tweet_id=reply.tweet_id
        WHERE tweet.tweet_id=${tweetId};`;
      const replies = await db.get(tweetReplyQuery);

      const tweetLikeQuery = `SELECT COUNT(tweet.tweet_id) AS likesCount
        FROM tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id
        WHERE tweet.tweet_id=${tweetId};`;
      const likes = await db.get(tweetLikeQuery);

      const tweetCompleteDetails = {
        tweet: tweetDetails.tweet,
        likes: likes.likesCount,
        replies: replies.repliesCount,
        dateTime: tweetDetails.date_time,
      };
      response.send(tweetCompleteDetails);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  getUserId,
  checkTweet,
  async (request, response) => {
    const { tweetId } = request.params;
    const listOfUsersQuery = `SELECT user.username AS username
      FROM user INNER JOIN like ON user.user_id=like.user_id
      WHERE like.tweet_id=${tweetId};`;
    const listUsers = await db.all(listOfUsersQuery);
    const arrayUsers = [];
    for (let obj of listUsers) {
      arrayUsers.push(obj.username);
    }
    response.send({ likes: arrayUsers });
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  getUserId,
  checkTweet,
  async (request, response) => {
    const { tweetId } = request.params;
    const listOfreplies = `SELECT user.name AS name, reply.reply AS reply
      FROM user INNER JOIN reply ON user.user_id=reply.user_id
      WHERE reply.tweet_id=${tweetId};`;
    const listReplies = await db.all(listOfreplies);
    response.send({ replies: listReplies });
  }
);

//API 9

app.get(
  "/user/tweets/",
  authentication,
  getUserId,
  async (request, response) => {
    const { userId } = request;
    const getTweetDetails = `SELECT tweet.tweet AS tweet,tweet.tweet_id AS tweet_id,tweet.date_time AS dateTime
    FROM tweet INNER JOIN user ON tweet.user_id=user.user_id
    WHERE tweet.user_id=${userId};`;
    const listOfTweets = await db.all(getTweetDetails);
    const userTweetDetails = [];
    for (let obj of listOfTweets) {
      const tweetReplyQuery = `SELECT COUNT(tweet.tweet_id) AS repliesCount
        FROM tweet INNER JOIN reply ON tweet.tweet_id=reply.tweet_id
        WHERE tweet.tweet_id=${obj.tweet_id};`;
      const replies = await db.get(tweetReplyQuery);

      const tweetLikesQuery = `SELECT COUNT(tweet.tweet_id) AS likesCount
        FROM tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id
        WHERE tweet.tweet_id=${obj.tweet_id};`;

      const likes = await db.get(tweetLikesQuery);

      const tweetDetails = {
        tweet: obj.tweet,
        likes: likes.likesCount,
        replies: replies.repliesCount,
        dateTime: obj.dateTime,
      };
      userTweetDetails.push(tweetDetails);
    }
    response.send(userTweetDetails);
  }
);

//API 10

app.post("/user/tweets/", authentication, async (request, response) => {
  const { tweet } = request.body;
  const insertTweetQuery = `INSERT INTO tweet(tweet)VALUES('${tweet}');`;
  await db.run(insertTweetQuery);
  response.send("Created a Tweet");
});

//API 11

app.delete(
  "/tweets/:tweetId/",
  authentication,
  getUserId,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    const listOfTweetsOfUserQuery = `SELECT tweet_id FROM tweet WHERE user_id=${userId};`;
    const listOfTweets = await db.all(listOfTweetsOfUserQuery);
    const checkTweet = listOfTweets.some((obj) => obj.tweet_id == tweetId);
    if (checkTweet === true) {
      const deleteTweet = `DELETE FROM tweet WHERE tweet_id=${tweetId};`;
      await db.run(deleteTweet);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
