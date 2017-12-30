'use strict';

const MongoClient = require('mongodb');
const ObjectID = MongoClient.ObjectID;

const DBURI = process.env.MONGODB_URI;

let insertDocuments = (coll, docs) => {
  return new Promise((resolve, reject) => {
    MongoClient.connect(DBURI, (err, db) => {
      if (err) {
        reject(err);
      }
      db.collection(coll).insertMany(docs, (err, result) => {
        db.close();
        if (err) {
          reject(err);
        }
        resolve(result);
      });
    });
  });
};

let insertDocument = (coll, doc) => {
  return new Promise((resolve, reject) => {
    MongoClient.connect(DBURI, (err, db) => {
      if (err) {
        reject(err);
      }
      db.collection(coll).insertOne(doc, (err, result) => {
        db.close();
        if (err) {
          reject(err);
        }
        resolve(result);
      });
    });
  });
};

let deleteDocument = (coll, doc) => {
  return new Promise((resolve, reject) => {
    MongoClient.connect(DBURI, (err, db) => {
      if (err) {
        reject(err);
      }
      db
        .collection(coll)
        .deleteOne({ _id: ObjectId(doc._id) }, (err, result) => {
          db.close();
          if (err) {
            reject(err);
          }
          resolve(result);
        });
    });
  });
};

let updateDocument = (coll, findQuery, updateQuery) => {
  return new Promise((resolve, reject) => {
    MongoClient.connect(DBURI, (err, db) => {
      if (err) {
        reject(err);
      }
      db
        .collection(coll)
        .updateOne(findQuery, updateQuery, { new: true }, (err, result) => {
          db.close;
          if (err) {
            reject(err);
          }
          resolve(result);
        });
    });
  });
};

let getDocuments = (coll, query) => {
  return new Promise((resolve, reject) => {
    MongoClient.connect(DBURI, (err, db) => {
      if (err) {
        reject(err);
      }
      db
        .collection(coll)
        .find(query)
        .toArray((err, docs) => {
          if (err) {
            reject(err);
          }
          resolve(docs);
        });
    });
  });
};

let getDocumentsWithLimit = (coll, query, limit) => {
  return new Promise((resolve, reject) => {
    MongoClient.connect(DBURI, (err, db) => {
      if (err) {
        reject(err);
      }
      db
        .collection(coll)
        .find(query)
        .limit(parseInt(limit))
        .toArray((err, docs) => {
          if (err) {
            reject(err);
          }
          resolve(docs);
        });
    });
  });
};

module.exports = {
  insertDocuments,
  updateDocument,
  getDocuments,
  insertDocument,
  deleteDocument,
  getDocumentsWithLimit
};
