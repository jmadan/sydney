const redis = require('redis');
const url = require('url');

let redisURL = url.parse(process.env.REDIS_URL);

function redisConnect() {
  let client = redis.createClient(redisURL.port, redisURL.hostname, {
    no_ready_check: true
  });
  client.auth(redisURL.auth.split(':')[1]);
  return client;
}

function redisQuit(client) {
  client.quit();
}

function setRedis(key, val) {
  let client = redisConnect();
  client.set(key, val, redis.print);
  redisQuit(client);
}

function getRedis(key) {
  return new Promise((resolve, reject) => {
    let client = redisConnect();
    client.get(key, (err, reply) => {
      if (err) {
        reject(err);
      }
      resolve(JSON.parse(reply));
    });
    redisQuit(client);
  });
}

function delRedis(key) {
  let client = redisConnect();
  client.del(key);
  redisQuit(client);
}

function checkRedis(key) {
  return new Promise((resolve, reject) => {
    let client = redisConnect();
    client.exists(key, (err, reply) => {
      if (err) {
        reject(err);
      }
      if (reply === 1) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    redisQuit(client);
  });
}

module.exports = {
  setRedis,
  getRedis,
  delRedis,
  checkRedis
};
