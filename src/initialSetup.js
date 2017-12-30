// const Category = require('../category/category');
// const Redis = require('../../utils/redis');
const MongoDB = require('./mongodb');
const mimir = require('./mimir');
const synaptic = require('./synaptic');

let distinctCategoryNumber = () => {
  return new Promise((resolve, reject) => {
    Category.getDistinctCategories()
      .then(values => {
        Redis.setRedis('distinctCategories', JSON.stringify(values));
        Redis.setRedis('numberOfCategories', JSON.stringify(values.length));
        resolve(values.length);
      })
      .catch(e => {
        reject(e);
      });
  });
};

let createDict = async docs => {
  console.log('docs length: ', docs.length);
  let dict = docs.reduce((prev, curr) => {
    return prev.concat(curr.stemwords);
  }, []);
  return mimir.dict(dict.toString());
};

let fetchDocs = async () => {
  return await MongoDB.getDocuments('feeditems', { status: 'classified' })
    .then(docs => {
      return docs;
    })
    .catch(err => console.log(err));
};

let createDictionary = async () => {
  let docs = await fetchDocs();
  let dictionary = await createDict(docs);
  Redis.setRedis('dictionary', JSON.stringify(dictionary));
  console.log('dictionary saved to Redis...');
};

let createCategoryMap = async () => {
  Redis.getRedis('distinctCategories')
    .then(cats => {
      let cMap = {};
      for (let i = 0, len = cats.length; i < len; i += 1) {
        cMap[cats[i]] = i;
      }
      Redis.setRedis('categoryMap', JSON.stringify(cMap));
    })
    .catch(er => console.log(er));
};

let createNetwork = () => {
  synaptic.createNetwork();
};

module.exports = {
  distinctCategoryNumber,
  createDictionary,
  createCategoryMap,
  createNetwork
};
