'use strict';
const CronJob = require('cron').CronJob;
const feed = require('./feed');
const initialSetup = require('./initialSetup');
const synaptic = require('./synaptic');
const MongoDB = require('./mongodb');
const ObjectID = require('mongodb').ObjectID;
const Neo4j = require('./neo4j');
const Raven = require('raven');
const Rollbar = require('rollbar');

const rollbar = new Rollbar(process.env.ROLLBAR_TOKEN);

Raven.config(process.env.RAVEN_CONFIG).install();

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
        console.log('Initial commands executed...', new Date().toUTCString());
      })
      .catch(e => rollbar.log(e));
  },
  start: false
});

let fetchInitialFeeds = new CronJob({
  //Seconds: 0-59, Minutes: 0-59, Hours: 0-23, Day of Month: 1-31, Months: 0-11, Day of Week: 0-6
  cronTime: '01 00 * * *',
  onTick: () => {
    console.log(
      'fetchInitialFeeds: Fetching RSS feeds and saving them in feeds collection',
      new Date().toUTCString()
    );
    // if (moveFeedItems.running) {
    //   console.log('stopping moveFeedItems job.....');
    //   moveFeedItems.stop();
    // }
    // updateFeedItemContent.stop();
    // classifyDocsBasedOnTopic.stop();
    feed
      .getRSSFeedProviders(rollbar)
      .then(providers => {
        console.log('fetchInitialFeeds: Got the providers');
        return feed.getProviderFeed(providers);
      })
      .then(flist => {
        console.log(
          'fetchInitialFeeds: Got the final Feed - updating time and saving it to Feed'
        );
        flist.forEach(feed.updateProvidersTime);
        flist.map(f => {
          feed.saveRssFeed(f.data);
        });
      })
      .catch(err => {
        rollbar.log(err);
      });
  },
  onComplete: () => {
    console.log('All feeds fetched....');
    moveFeedItems.start();
    updateFeedItemContent.start();
    classifyDocsBasedOnTopic.start();
  },
  start: false
});

let stopInitialFeedsJob = new CronJob({
  cronTime: '*/11 * * * *',
  onTick: () => {
    console.log(
      'stopInitialFeedsJob: Stopping Fetching RSS feeds...',
      new Date().toUTCString()
    );
    fetchInitialFeeds.stop();
  },
  start: false
});

let moveFeedItems = new CronJob({
  cronTime: '*/1 * * * *',
  onTick: () => {
    console.log(
      'moveFeedItems: fetching feed content and moving to feeditems...',
      new Date().toUTCString()
    );
    feed
      .fetchItems('feed', { status: 'pending body' }, 25)
      .then(result => {
        if (result.length > 0) {
          result.map(item => {
            feed
              .moveUniqueFeedItem(item, rollbar)
              .then(response => {
                console.log(
                  response.result.ok,
                  'moveFeedItems: Document Moved and Deleted...'
                );
              })
              .catch(e => {
                rollbar.log(e);
              });
          });
        } else {
          console.log('moveFeedItems: Nothing to move to feeditems....');
        }
      })
      .catch(err => {
        rollbar.log(err);
      });
  },
  start: false
});

let updateFeedItemContent = new CronJob({
  cronTime: '*/2 * * * *',
  onTick: () => {
    console.log(
      'updateFeedItemContent: Updating feed item content with keywords, author, url from article body...',
      new Date().toUTCString()
    );
    feed
      .fetchItems('feeditems', { status: 'pending body' }, 10, rollbar)
      .then(result => {
        feed
          .fetchFeedEntry(result)
          .then(res => {
            res.map(r => {
              console.log(
                'updateFeedItemContent - feed entry: ',
                r.url,
                r.keywords,
                r.author,
                r.img
              );
              if (r.error) {
                rollbar.log(r);
              } else {
                feed.updateFeedItem(r, rollbar).then(response => {
                  console.log(
                    'updateFeedItemContent: Documents updated and saved: ',
                    response.result.ok
                  );
                });
              }
            });
          })
          .catch(err => {
            rollbar.log(err);
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
      .fetchItems('feeditems', { status: 'classified' }, 15)
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
  cronTime: '*/30 * * * * *', //Seconds: 0-59, Minutes: 0-59, Hours: 0-23, Day of Month: 1-31, Months: 0-11 ,Day of Week: 0-6
  onTick: async () => {
    console.log(
      'classifyDocsBasedOnTopic: Initiating article classification based on Topic...'
    );
    MongoDB.getDocuments('categories', {})
      .then(async cats => {
        let docs = await feed.fetchItems(
          'feeditems',
          {
            $and: [{ status: 'unclassified' }, { topic: { $ne: 'All' } }]
          },
          2
        );
        return docs.map(d => {
          if (cats.find(c => c.name === d.topic)) {
            d.parentcat = cats.find(c => {
              if (c.name === d.topic && !c.parent) {
                return c;
              }
            });
          }
          if (cats.find(c => c.name === d.subtopic)) {
            d.subcategory = cats.find(c => {
              if (c.name === d.subtopic && c.parent) {
                return c;
              }
            });
          }
          return d;
        });
      })
      .then(async documents => {
        if (documents.length) {
          // let docss = await Promise.all(
          //   documents.map(feed.updateWithAuthorAndKeywords)
          // );
          documents.map(d => {
            if (d._id) {
              console.log(
                'classifyDocsBasedOnTopic: before classifying updating the article: ',
                d._id
              );
              MongoDB.updateDocument(
                'feeditems',
                { _id: ObjectID(d._id) },
                {
                  $set: {
                    status: 'classified',
                    parentcat: d.parentcat,
                    subcategory: d.subcategory,
                    author: d.author,
                    keywords: d.keywords,
                    img: d.img
                  }
                }
              )
                .then(response => {
                  console.log(
                    'classifyDocsBasedOnTopic: ',
                    response.value._id,
                    response.value.topic
                  );
                  Neo4j.createArticle(response.value).then(result => {
                    // console.log(
                    //   'Article created...',
                    //   result.result.records[0].get('a').properties.id
                    // );
                    if (
                      typeof response.value.author === 'object' &&
                      response.value.author !== null &&
                      response.value.author.length > 0
                    ) {
                      response.value.author.forEach(author => {
                        Neo4j.articleAuthorRelationship(
                          author,
                          result.result.records[0].get('a').properties.id
                        );
                      });
                    } else if (typeof response.value.author === 'string') {
                      Neo4j.articleAuthorRelationship(
                        response.value.author,
                        result.result.records[0].get('a').properties.id
                      );
                    }

                    Neo4j.articleProviderRelationship(response.value);
                    if (response.value.subcategory) {
                      Neo4j.articleSubCategoryRelationship(response.value);
                    } else {
                      Neo4j.articleCategoryRelationship(response.value);
                    }
                  });
                })
                .catch(err => rollbar.log(err));
            }
          });
        } else {
          console.log(
            'classifyDocsBasedOnTopic: No Documents left to work on......'
          );
        }
      })
      .catch(e => rollbar.log(e));
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
  // initialjobs.start();
  fetchInitialFeeds.start();
  // stopInitialFeedsJob.start();
  moveFeedItems.start();
  updateFeedItemContent.start();
  // // classifyDocs.stop();
  classifyDocsBasedOnTopic.start();
  // synapticTraining.start();
  console.log('Started them all....');
}

main();
