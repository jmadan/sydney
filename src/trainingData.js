'use strict';

const mimir = require('./mimir');

let convertToVector = (doc, dict) => {
  console.log('doc id: ', doc._id);
  return mimir.bow(doc.stemwords.toString(), dict);
};

let formattedData = (docs, dict) => {
  let tdata = [];
  docs.map(d => {
    tdata.push({
      input: mimir.bow(d.stemwords.toString(), dict),
      output: d.category
    });
  });
  return tdata;
};

module.exports = { formattedData, convertToVector };
