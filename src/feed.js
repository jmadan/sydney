'use strict';
const rp = require('request-promise');
const cheerio = require('cheerio');
const natural = require('natural');
const textract = require('textract');
const MongoDB = require('./mongodb');
const ObjectID = require('mongodb').ObjectID;
const he = require('he');

const lancasterStemmer = natural.LancasterStemmer;

let getRSSFeedProviders = () => {
  return new Promise(function(resolve) {
    MongoDB.getDocuments('feedproviders', {
      status: { $in: ['active', 'Active'] }
    }).then(providerList => {
      resolve({ list: providerList });
    });
  });
};

let getFeedItems = provider => {
  console.log(provider.url);
  let feedList = [];
  var options = {
    uri: provider.url,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X x.y; rv:42.0) Gecko/20100101 Firefox/42.0'
    }
  };
  return new Promise((resolve, reject) => {
    rp(options)
      .then(res => {
        let $ = cheerio.load(res, {
          withDomLvl1: true,
          normalizeWhitespace: true,
          xmlMode: true,
          decodeEntities: true
        });
        let lastBuildDate = Date.parse($('lastBuildDate').text());
        switch (provider.name) {
          case 'The Atlantic':
            console.log('I am in the Atlantic');
            $('entry').each(function() {
              feedList.push({
                title: $(this)
                  .find('title')
                  .text(),
                url: $(this)
                  .find('link')
                  .attr('href'),
                description: $(this)
                  .find('summary')
                  .text()
                  .replace(/<[^>]*>/g, ''),
                author: $(this)
                  .find('author')
                  .find('name')
                  .text(),
                status: 'pending body',
                type: 'story',
                pubDate: Date.parse(
                  $(this)
                    .find('published')
                    .text()
                ),
                provider: provider.name,
                topic: provider.topic,
                subtopic: provider.subtopic ? provider.subtopic : ''
              });
            });
            break;
          case 'The Verge':
            console.log('I am in the Verge');
            $('entry').each(function() {
              feedList.push({
                title: $(this)
                  .find('title')
                  .text(),
                url: $(this)
                  .find('link')
                  .attr('href'),
                description: '',
                author: $(this)
                  .find('author')
                  .find('name')
                  .text(),
                status: 'pending body',
                type: 'story',
                pubDate: Date.parse(
                  $(this)
                    .find('published')
                    .text()
                ),
                provider: provider.name,
                topic: provider.topic,
                subtopic: provider.subtopic ? provider.subtopic : ''
              });
            });
            break;
          case 'Nature':
            console.log('I am in Nature');
            $('item').each(function() {
              feedList.push({
                title: $(this)
                  .find('title')
                  .text(),
                url: $(this)
                  .find('link')
                  .text(),
                description: $('content\\:encoded').text(),
                author: '',
                status: 'pending body',
                type: 'story',
                pubDate: null,
                provider: provider.name,
                topic: provider.topic,
                subtopic: provider.subtopic ? provider.subtopic : ''
              });
            });
            break;
          default:
            console.log('I am in the default');
            if ($('item').length) {
              $('item').each(function() {
                feedList.push({
                  title: $(this)
                    .find('title')
                    .text(),
                  url: $(this)
                    .find('link')
                    .text(),
                  description: $(this)
                    .find('description')
                    .text()
                    .replace(/<[^>]*>/g, ''),
                  img: $(this)
                    .find('media\\:thumbnail')
                    .attr('url'),
                  author: $(this)
                    .find('dc\\:creator')
                    .text(),
                  category: $(this)
                    .find('category')
                    .map((i, el) => {
                      return $(el).text();
                    })
                    .get()
                    .join(', '),
                  keywords: $(this)
                    .find('media\\:keywords')
                    .text(),
                  status: 'pending body',
                  type: 'story',
                  pubDate: Date.parse(
                    $(this)
                      .find('pubDate')
                      .text()
                  ),
                  provider: provider.name,
                  topic: provider.topic,
                  subtopic: provider.subtopic ? provider.subtopic : ''
                });
              });
            } else if ($('entry').length) {
              $('event').each(function() {
                feedList.push({
                  title: $(this)
                    .find('title')
                    .text(),
                  url: $(this)
                    .find('id')
                    .text(),
                  description: $(this)
                    .find('content')
                    .text()
                    .replace(/<[^>]*>/g, ''),
                  author: $(this)
                    .find('author')
                    .text(),
                  status: 'pending body',
                  type: 'story',
                  pubDate: Date.parse(
                    $(this)
                      .find('published')
                      .text()
                  ),
                  provider: provider.name,
                  topic: provider.topic,
                  subtopic: provider.subtopic ? provider.subtopic : ''
                });
              });
            } else {
              console.log('I am useless: ', provider.url);
            }
        }
        resolve(feedList);
      })
      .catch(err => reject(err));
  });
};

let returnNew = async (val, index, arr) => {
  val['data'] = await getFeedItems(val);
  return val;
};

let updateProvidersTime = provider => {
  MongoDB.updateDocument(
    'feedproviders',
    { _id: ObjectID(provider._id) },
    { $set: { lastPulled: new Date().toISOString() } }
  ).then(response => {
    console.log(
      'response after updating time for feed parsing time: ',
      response.ok
    );
  });
};

let getProviderFeed = async providers => {
  let flist = await Promise.all(providers.list.map(returnNew));
  providers.list.forEach(updateProvidersTime);
  return flist;
};

let saveRssFeed = items => {
  if (items.length > 0) {
    let dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - 2);
    let finalItems = items.filter(i => {
      if (new Date(i.pubDate) >= dateLimit) {
        return i;
      }
    });
    if (finalItems.length > 0) {
      MongoDB.insertDocuments('feed', finalItems).then(res => {
        console.log('item saved: ', res.result.ok);
      });
    }
  } else {
    console.log('No Data to Save');
  }
};

let fetchItems = (coll, query, limit) => {
  return new Promise(resolve => {
    MongoDB.getDocumentsWithLimit(coll, query, limit).then(result => {
      resolve(result);
    });
  });
};

let makeRequests = item => {
  console.log('making requests: ', item._id, item.url);
  return new Promise((resolve, reject) => {
    rp(item.url)
      .then(res => {
        let $ = cheerio.load(res, {
          withDomLvl1: true,
          normalizeWhitespace: true,
          xmlMode: false,
          decodeEntities: true
        });
        switch (item.provider) {
          case 'Nature':
            item.title = $('meta[name="dc.title"]').attr('content');
            item.url = $('meta[name="prism.url"]').attr('content');
            item.description = $('meta[name="dc.description"]').attr('content')
              ? he.decode($('meta[name="dc.description"]').attr('content'))
              : '';

            let keywords = [];
            if ($('meta[name="dc.subject"]').length > 0) {
              $('meta[name="dc.subject"]').map((i, el) => {
                keywords.push(String(el.attribs['content']));
              });
            }
            item.keywords = keywords;

            let auth = [];
            $('meta[name="dc.creator"]').map((i, el) => {
              auth.push(String(el.attribs['content']));
            });

            item.author = auth;
            item.pubDate = Date.parse(
              $('meta[name="dc.date"]').attr('content')
            );
            textract.fromUrl(item.url, function(error, text) {
              if (text) {
                item.stemwords = lancasterStemmer.tokenizeAndStem(
                  text.replace(/[0-9]/g, '')
                );
                item.itembody = text.replace(/\s+/gm, ' ').replace(/\W/g, ' ');
              } else {
                item.stemwords = '';
                item.itembody = '';
              }
              resolve(item);
            });
            break;
          default:
            if (item.description === '') {
              item.description = $('meta[name="description"]').attr('content')
                ? he.decode($('meta[name="description"]').attr('content'))
                : '';
            }
            if (item.keywords === '') {
              if ($('meta[name="news_keywords"]').length > 0) {
                item.keywords = $('meta[name="news_keywords"]').attr('content');
              } else if ($('meta[name="keywords"]').length > 0) {
                item.keywords = $('meta[name="keywords"]').attr('content');
              } else if ($('meta[name="article:tag"]').length > 0) {
                item.keywords = $('meta[name="article:tag"]').attr('content');
              } else if ($('meta[name="sailthru.tags"]').length > 0) {
                item.keywords = $('meta[name="sailthru.tags"]').attr('content');
              }
            }
            if (item.author === '') {
              item.author = $('meta[name="author"]').attr('content');
            }
            if (item.img === undefined) {
              item.img = $('meta[property="og:image:url"]').attr('content');
            }
            textract.fromUrl(item.url, function(error, text) {
              if (text) {
                item.stemwords = lancasterStemmer.tokenizeAndStem(
                  text.replace(/[0-9]/g, '')
                );
                item.itembody = text.replace(/\s+/gm, ' ').replace(/\W/g, ' ');
              } else {
                item.stemwords = '';
                item.itembody = '';
              }
              resolve(item);
            });
        }
      })
      .catch(err => {
        if (err.statusCode === 500 || err.statusCode === 404) {
          handleError(err, item);
        }
        // reject({ errName: err.name, errCode: err.statusCode, item: item._id });
        reject({ item, error: true });
        console.log('Item with error: ', item.url, err.statusCode);
      });
  });
};

let fetchFeedEntry = async items => {
  let itemsArray = await Promise.all(items.map(makeRequests));
  return itemsArray;
};

let updateFeedItem = item => {
  return new Promise(function(resolve, reject) {
    MongoDB.updateDocumentWithUpsert(
      'feeditems',
      { _id: ObjectID(item._id) },
      {
        url: item.url,
        title: item.title,
        description: item.description,
        type: item.type,
        keywords: item.keywords,
        img: item.img,
        author: item.author,
        pubDate: item.pubDate,
        provider: item.provider,
        topic: item.topic,
        subtopic: item.subtopic,
        category: item.category,
        status: 'unclassified',
        stemwords: item.stemwords
      }
    )
      .then(response => {
        MongoDB.deleteDocument('feed', item)
          .then(response => {
            resolve(response);
          })
          .catch(err => {
            console.log(err);
          });
      })
      .catch(e => {
        console.log(e);
      });
  });
};

let moveUniqueFeedItem = item => {
  return new Promise(function(resolve, reject) {
    MongoDB.updateDocumentWithUpsert(
      'feeditems',
      { url: item.url },
      {
        url: item.url,
        title: item.title,
        description: item.description ? item.description : '',
        type: item.type,
        keywords: item.keywords ? item.keywords : '',
        img: item.img ? item.img : '',
        author: item.author ? item.author : '',
        pubDate: item.pubDate ? item.pubDate : '',
        provider: item.provider,
        topic: item.topic,
        subtopic: item.subtopic ? item.subtopic : '',
        category: item.category ? item.category : '',
        status: 'pending body',
        stemwords: item.stemwords ? item.stemwords : ''
      }
    )
      .then(response => {
        MongoDB.deleteDocument('feed', item)
          .then(response => {
            resolve(response);
          })
          .catch(err => {
            console.log(err);
          });
      })
      .catch(e => {
        console.log(e);
      });
  });
};

let updateWithAuthorAndKeywords = item => {
  return new Promise((resolve, reject) => {
    rp(item.url)
      .then(res => {
        let $ = cheerio.load(res, {
          withDomLvl1: true,
          normalizeWhitespace: true,
          xmlMode: true,
          decodeEntities: true
        });
        if (item.provider === 'MIT Technology Review') {
          if (!item.keywords) {
            item.keywords = $('meta[name="news_keywords"]').attr('content');
          }
          if (!item.author) {
            item.author = $('meta[name="author"]').attr('content');
          }
          if (!item.img) {
            item.img = $('meta[property="og:image:url"]').attr('content');
          }
        } else if (item.provider === 'Techcrunch') {
          if (!item.keywords) {
            item.keywords = $('meta[name="sailthru.tags"]').attr('content');
          }
          if (!item.author) {
            item.author = $('meta[name="author"]').attr('content');
          }
          if (!item.img) {
            item.img = $('meta[property="og:image"]').attr('content');
          }
        } else if (item.provider === 'Telegraph') {
          if (!item.keywords) {
            item.keywords = $('meta[name="keywords"]').attr('content');
          }
          if (!item.author) {
            item.author = $('meta[name="DCSext.author"]').attr('content');
          }
          if (!item.img) {
            item.img = $('meta[property="og:image"]').attr('content');
          }
        } else {
          if (!item.keywords) {
            item.keywords = $('meta[name="keywords"]').attr('content');
          }
          if (!item.author) {
            item.author = $('meta[name="author"]').attr('content');
          }
          if (!item.img) {
            item.img = $('meta[property="og:image:url"]').attr('content');
          }
        }
        resolve(item);
      })
      .catch(err => {
        handleError(err, item);
        reject({ errName: err.name, errCode: err.statusCode, item: item._id });
      });
  });
};

let handleError = (err, item) => {
  if (
    err.statusCode === 404 ||
    err.statusCode === 503 ||
    err.statusCode === 500
  ) {
    MongoDB.deleteDocument('feeditems', item).then(response => {
      console.log('document deleted from feeditems: ', response.result.ok);
      MongoDB.deleteDocument('feed', item).then(res => {
        console.log('document deleted from feed: ', res.result.ok);
      });
    });
  }
};
//==================

module.exports = {
  makeRequests,
  getProviderFeed,
  getFeedItems,
  getRSSFeedProviders,
  saveRssFeed,
  fetchItems,
  fetchFeedEntry,
  updateFeedItem,
  updateWithAuthorAndKeywords,
  moveUniqueFeedItem
};
