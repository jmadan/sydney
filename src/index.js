'use strict';

const CronJob = require('cron').CronJob;
const feed = require('./feed');
const initialSetup = require('./initialSetup');
const synaptic = require('./synaptic');
const MongoDB = require('./mongodb');
const ObjectID = require('mongodb').ObjectID;
const Neo4j = require('./neo4j');

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
  cronTime: '00 13 * * *',
  onTick: () => {
    console.log('Fetching RSS feeds....................');
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
          console.log(r.url, r.keywords, r.author);
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
        output: doc.category,
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
      .fetchItems('feeditems', { status: 'classified' }, 1)
      .then(doc => {
        if (doc.length > 0) {
          return synaptic.classifyDocs(doc[0]);
        } else {
          return null;
        }
      })
      .then(item => {
        if (item) {
          saveClassifiedDocs(item);
        } else {
          console.log('Nothing to Classify...');
        }
      })
      .catch(e => console.log(e));
  },
  start: false
});

let classifyDocsBasedOnTopic = new CronJob({
  cronTime: '*/2 * * * *', //Seconds: 0-59, Minutes: 0-59, Hours: 0-23, Day of Month: 1-31, Months: 0-11 ,Day of Week: 0-6
  onTick: async () => {
    console.log('Initiating article classification based on Topic...');
    MongoDB.getDocuments('categories', { parent: { $exists: false } })
      .then(async cats => {
        let docs = await feed.fetchItems(
          'feeditems',
          { $and: [{ status: 'unclassified' }, { topic: { $ne: 'All' } }] },
          20
        );
        console.log('search result docs: ', docs.length);
        return docs.map(d => {
          if (cats.find(c => c.name === d.topic)) {
            d.parentcat = cats.find(c => {
              if (c.name === d.topic) {
                return c;
              }
            });
          }
          return d;
        });
      })
      .then(async documents => {
        if (documents.length) {
          console.log(documents[0]._id);
          let docss = await Promise.all(
            documents.map(feed.updateWithAuthorAndKeywords)
          );
          docss.map(d => {
            MongoDB.updateDocument(
              'feeditems',
              { _id: ObjectID(d._id) },
              {
                $set: {
                  status: 'classified',
                  parentcat: d.parentcat,
                  author: d.author,
                  keywords: d.keywords,
                  img: d.img
                }
              }
            )
              .then(response => {
                console.log(response.value._id, response.value.topic);
                Neo4j.createArticle(response.value).then(result => {
                  if (response.value.author) {
                    Neo4j.articleAuthorRelationship(response.value);
                  }
                  Neo4j.articleProviderRelationship(response.value);
                  console.log('Article created...', result.msg);
                  Neo4j.articleCategoryRelationship(response.value);
                });
              })
              .catch(err => console.log(err));
          });
        } else {
          console.log('No Documents left to work on......');
        }
      })
      .catch(e => console.log(e));
  },
  start: true
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
  // classifyDocs.stop();
  classifyDocsBasedOnTopic.start();
  // synapticTraining.start();
  console.log('Started them all....');
}

main();
