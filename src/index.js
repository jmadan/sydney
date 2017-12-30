'use strict';

const CronJob = require('cron').CronJob;
const feed = require('./feed');
const initialSetup = require('./initialSetup');
const synaptic = require('./synaptic');
const MongoDB = require('./mongodb');
const ObjectID = require('mongodb').ObjectID;

let initialjobs = new CronJob({
  cronTime: '5 0 * 1 *',
  onTick: () => {
    initialSetup
      .distinctCategoryNumber()
      .then(num => {
        console.log(num);
        initialSetup.createDictionary();
        initialSetup.createCategoryMap();
        initialSetup.createNetwork();
        console.log('Initial commands executed...');
      })
      .catch(e => console.log(e));
  },
  start: false
});

let fetchInitialFeeds = new CronJob({
  cronTime: '0 5 * * *',
  onTick: () => {
    feed
      .getRSSFeedProviders()
      .then(providers => {
        return feed.getProviderFeed(providers);
      })
      .then(flist => {
        flist.map(f => {
          feed
            .saveRssFeed(f.data)
            .then(result => {
              console.log(result.result.n + ' feeds processed.');
            })
            .catch(err => console.log(err, f));
        });
      });
  },
  start: false
});

let fetchFeedContents = new CronJob({
  cronTime: '*/1 * * * *',
  onTick: () => {
    console.log('fetching Feed content...', new Date().toUTCString());
    feed.fetchItems('feed', { status: 'pending body' }, 10).then(result => {
      feed.fetchContents(result).then(res => {
        res.map(r => {
          feed.updateAndMoveFeedItem(r).then(result => {
            console.log(result.result.n + ' Documents saved.');
          });
        });
      });
    });
  },
  start: false
});

let saveClassifiedDocs = doc => {
  MongoDB.updateDocument(
    'feeditems',
    { _id: ObjectID(doc._id) },
    {
      $set: {
        category: doc.category,
        status: doc.status
      }
    }
  ).then(result => {
    console.log(
      'Document Updated:-  ',
      result.value._id,
      result.value.category,
      result.lastErrorObject.updatedExisting
    );
  });
};

let classifyDocs = new CronJob({
  cronTime: '*/3 * * * *',
  onTick: () => {
    console.log('Initiating article classification ...');
    feed
      .fetchItems('feeditems', { status: 'unclassified' }, 1)
      .then(doc => {
        return synaptic.classifyDocs(doc[0]);
      })
      .then(item => {
        saveClassifiedDocs(item);
      })
      .catch(e => console.log(e));
  },
  start: false
});

let synapticTraining = new CronJob({
  cronTime: '01 11 * 1 *',
  onTick: () => {
    console.log('Triaing the Network Now.....');
    synaptic.trainNetwork();
  },
  start: false
});

function main() {
  initialjobs.start();
  fetchInitialFeeds.start();
  fetchFeedContents.start();
  classifyDocs.start();
  synapticTraining.start();
  console.log('Started them all....');
}

main();
