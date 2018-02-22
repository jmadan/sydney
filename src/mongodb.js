'use strict';

const MongoClient = require('mongodb');
const ObjectID = MongoClient.ObjectID;
const DBURI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_NAME;
let db;

MongoClient.connect(
  DBURI,
  {
    poolSize: 10
  },
  (err, client) => {
    if (err) {
      throw err;
    }
    db = client.db(DB_NAME);
  }
);

let insertDocuments = (coll, docs) => {
  return new Promise((resolve, reject) => {
    db.collection(coll).insertMany(docs, (err, result) => {
      if (err) {
        reject(err);
      }
      resolve(result);
    });
  });
};

let insertDocument = (coll, doc) => {
  return new Promise((resolve, reject) => {
    db.collection(coll).insert(doc, (err, result) => {
      if (err) {
        console.log('I got err: ', err);
        reject(err);
      }
      resolve(result);
    });
  });
};

let deleteDocument = (coll, doc) => {
  return new Promise((resolve, reject) => {
    db.collection(coll).deleteOne({ _id: ObjectID(doc._id) }, (err, result) => {
      if (err) {
        reject(err);
      }
      resolve(result);
    });
  });
};

let updateDocument = (coll, findQuery, updateQuery) => {
  return new Promise((resolve, reject) => {
    db
      .collection(coll)
      .findOneAndUpdate(
        findQuery,
        updateQuery,
        { returnOriginal: false },
        (err, result) => {
          if (err) {
            reject(err);
          }
          resolve(result);
        }
      );
  });
};

let getDocuments = (coll, query) => {
  return new Promise((resolve, reject) => {
    db
      .collection(coll)
      .find(query)
      .toArray((err, docs) => {
        if (err) {
          reject(err);
        }
        resolve(docs);
      });
    // MongoClient.connect(DBURI, (err, datab) => {
    //   if (err) {
    //     reject(err);
    //   }
    //   datab
    //     .db('manhattan')
    //     .collection(coll)
    //     .find(query)
    //     .toArray((err, docs) => {
    //       if (err) {
    //         reject(err);
    //       }
    //       datab.close();
    //       resolve(docs);
    //     });
    // });
  });
};

let getDocumentsWithLimit = (coll, query, limit) => {
  return new Promise((resolve, reject) => {
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
};

let updateDocumentWithUpsert = (coll, findQuery, updateQuery) => {
  return new Promise((resolve, reject) => {
    db
      .collection(coll)
      .update(findQuery, updateQuery, { upsert: true }, (err, result) => {
        if (err) {
          reject(err);
        }
        resolve(result);
      });
  });
};

let checkDocument = (coll, query) => {
  return new Promise((resolve, reject) => {
    db
      .collection(coll)
      .find(query, { _id: 1 })
      .limit(1)
      .toArray((err, docs) => {
        if (err) {
          reject(err);
        }
        resolve(docs);
      });
  });
};

module.exports = {
  insertDocuments,
  updateDocument,
  getDocuments,
  insertDocument,
  deleteDocument,
  getDocumentsWithLimit,
  updateDocumentWithUpsert,
  checkDocument
};
