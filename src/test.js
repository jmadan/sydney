'use strict';
const feed = require('./feed');

function test(providers) {
  feed.getProviderFeed(providers).then(flist => {
    console.log('got the feedlist...');
    flist.map(f => {
      feed.saveRssFeed(f.data);
      // .then(result => {
      //   console.log(result.result.n + ' feeds processed.');
      // })
      // .catch(err => console.log(err, f));
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
    });
  });
}

test({
  list: [
    {
      name: 'The Verge',
      url: 'https://www.theverge.com/rss/index.xml',
      topic: 'Technology',
      status: 'Active',
      lastPulled: '2018-02-01T09:50:04.319Z'
    }
  ]
});
