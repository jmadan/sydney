'use strict';
// const feed = require('./feed');
const Neo4j = require('./neo4j');

function test(article) {
  Neo4j.createArticle(article).then(result => {
    console.log(
      'Article created...',
      result.result.records[0].get('a').properties.aid
    );
    Neo4j.articleAuthorRelationship(
      article.author,
      result.result.records[0].get('a').properties.aid
    );
    Neo4j.articleProviderRelationship(article);
    // console.log('Article Provider Relationship...');
    Neo4j.articleCategoryRelationship(article);
    // console.log('Article Category Relationship...');
  });
  // feed.getProviderFeed(providers).then(flist => {
  //   console.log('got the feedlist...');
  //   flist.map(f => {
  //     feed.saveRssFeed(f.data);
  //     // .then(result => {
  //     //   console.log(result.result.n + ' feeds processed.');
  //     // })
  //     // .catch(err => console.log(err, f));
  //     feed.fetchItems('feed', { status: 'pending body' }, 10).then(result => {
  //       feed.fetchContents(result).then(res => {
  //         res.map(r => {
  //           console.log(r.url, r.keywords, r.author);
  //           feed.updateAndMoveFeedItem(r).then(result => {
  //             console.log(result.result.n + ' Documents saved.');
  //           });
  //         });
  //       });
  //     });
  //   });
  // });
}

test({
  _id: '5a65e579670c7645a286df64',
  url: 'http://feedproxy.google.com/~r/brainpickings/rss/~3/Uqc5U4ISfQw/',
  title:
    'W.H. Auden on the Political Power of Art and the Crucial Difference Between Party Issues and Revolutionary Issues',
  description:
    '"In our age, the mere making of a work of art is itself a political act."',
  keywords:
    "auden,the dyer's hand,the poet and the city,art and politics,,art,books,creativity,culture,politics,W.H. Auden",
  author: 'Maria Popova',
  pubDate: 1515668411000,
  provider: 'Brain Pickings',
  topic: 'Culture',
  category: 'art, culture, books, creativity, politics, W.H. Auden',
  status: 'unclassified'
});
