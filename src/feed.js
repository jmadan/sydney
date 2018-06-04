'use strict';
const rp = require('request-promise');
const cheerio = require('cheerio');
const natural = require('natural');
const textract = require('textract');
const MongoDB = require('./mongodb');
const ObjectID = require('mongodb').ObjectID;
const curljs = require('curljs');
const he = require('he');
const PromisePool = require('es6-promise-pool');
const poolConcurrency = 10;
const lancasterStemmer = natural.LancasterStemmer;

let getRSSFeedProviders = rollbar => {
  return new Promise(function(resolve) {
    MongoDB.getDocuments('feedproviders', {
      status: { $in: ['active', 'Active'] }
    })
      .then(providerList => {
        resolve({ list: providerList });
      })
      .catch(e => {
        rollbar.log(e);
      });
  });
};

let getFeedItems = provider => {
  let feedList = [];
  var options = {
    uri: provider.url,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36'
    }
  };
  return new Promise((resolve, reject) => {
    rp(options)
      .then(res => {
        if (provider.type === 'JSON') {
          console.log('RSS feed JSON: ', provider.name);
          let response = JSON.parse(res);
          response.articles.map(article => {
            feedList.push({
              title: article.title,
              url: article.url,
              img: article.urlToImage,
              description: article.description,
              author: article.author,
              status: 'pending body',
              type: 'story',
              pubDate: Date.parse(article.publishedAt),
              provider: provider.name,
              topic: provider.topic,
              subtopic: provider.subtopic ? provider.subtopic : ''
            });
          });
          provider['data'] = feedList;
          // resolve(feedList);
          resolve(provider);
        } else {
          console.log('RSS feed XML: ', provider.name);
          let $ = cheerio.load(res, {
            withDomLvl1: true,
            normalizeWhitespace: true,
            xmlMode: true,
            decodeEntities: true
          });
          let lastBuildDate = Date.parse($('lastBuildDate').text());
          switch (provider.name) {
            case 'The Atlantic':
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
          provider['data'] = feedList;
          resolve(provider);
        }
      })
      .catch(err => reject(err));
  });
};

let getProviderFeed = async providers => {
  console.log('providers list length: ', providers.list.length);
  const generatePromises = function*() {
    for (let count = 0; count < providers.list.length; count++) {
      console.log('count: ', count);
      yield getFeedItems(providers.list[count]);
    }
  };

  const promiseIterator = generatePromises();
  let pool = new PromisePool(promiseIterator, poolConcurrency);
  await pool.start();
  return providers.list;
};

let updateProviderFeedDateAndTime = provider => {
  console.log(
    'providers to be updated for Date and Time: ',
    provider.name,
    provider._id
  );
  return new Promise((resolve, reject) => {
    MongoDB.updateDocument(
      'feedproviders',
      { _id: ObjectID(provider._id) },
      { $set: { lastPulled: new Date().toISOString() } }
    )
      .then(res => {
        console.log('Provider updated: ', res.ok);
        resolve(true);
      })
      .catch(e => {
        reject(e);
      });
  });
};

let saveRssFeed = items => {
  if (items.length > 0) {
    console.log('I have some data....');
    let dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - 2);
    let finalItems = items.filter(i => {
      if (new Date(i.pubDate) >= dateLimit && new Date(i.pubDate) < new Date().setDate(new Date().getDate() + 1)) {
        return i;
      }
    });
    if (finalItems.length > 0) {
      console.log(finalItems.length);
      MongoDB.insertDocuments('feed', finalItems).then(res => {
        console.log('item saved: ', res.result.ok);
      });
    } else {
      console.log('Date filter has filtered out everything....');
    }
  } else {
    console.log('No Data to Save');
  }
};

let fetchItems = (coll, query, limit, rollbar) => {
  return new Promise(resolve => {
    MongoDB.getDocumentsWithLimit(coll, query, limit)
      .then(result => {
        resolve(result);
      })
      .catch(e => rollbar.log(e));
  });
};

let makeRequests = item => {
  console.log(
    'updating feeditem content - making requests: ',
    item._id,
    item.url
  );
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
          case 'Axios':
            item.title = $('meta[property="og:title"]').attr('content');
            item.description = $('meta[property="og:description"]').attr(
              'content'
            )
              ? he.decode($('meta[property="og:description"]').attr('content'))
              : '';

            item.keywords = $('meta[name="keywords"]').attr('content');
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
          case 'Four Four Two':
            item.keywords = $('meta[name="keywords"]').attr('content');
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
          case 'ESPN Cric Info': //unsecure
            item.keywords = $('meta[name="keywords"]').attr('content');
            item.img = $('meta[property="og:image"]').attr('content');
            item.author = $('span[class="author"]').text();
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
          case 'Telegraph':
            item.keywords = $('meta[name="keywords"]').attr('content');
            if (item.description === '') {
              item.description = $('meta[name="description"]').attr('content');
            }
            item.img = $('meta[property="og:image"]').attr('content');
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
          case 'NY Times':
            if (item.description === '') {
              item.description = $('meta[name="description"]').attr('content');
            }
            item.keywords = $('meta[name="keywords"]').attr('content');
            item.img = $('meta[property="og:image"]').attr('content');
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
          case 'The Verge':
            item.description = he.decode(
              $('meta[name="description"]').attr('content')
            );
            item.keywords = $('meta[name="sailthru.tags"]').attr('content');
            item.author = $('meta[property="author"]').attr('content');
            item.img = $('meta[property="og:image"]').attr('content');
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
          case 'Techcrunch':
            item.description = he.decode(
              $('meta[property="og:description"]').attr('content')
            );
            item.keywords = $('meta[name="sailthru.tags"]').attr('content');
            item.author = $('meta[name="author"]').attr('content');
            item.img = $('meta[property="og:image"]').attr('content');
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
          case 'How to Geek':
            item.description = he.decode(
              $('meta[property="og:description"]').attr('content')
            );
            item.img = $('meta[property="og:image"]').attr('content');
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
          case 'Esquire':
            item.keywords = $('meta[name="keywords"]').attr('content');
            item.img = $('meta[property="og:image"]').attr('content');
            item.author = 'Esquire';
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
              if ($('meta[name="description"]').length > 0) {
                item.description = he.decode(
                  $('meta[name="description"]').attr('content')
                );
              } else if ($('meta[name="og:description"]').length > 0) {
                item.description = he.decode(
                  $('meta[property="og:description"]').attr('content')
                );
              }
            }
            if (item.keywords === '') {
              if ($('meta[name="news_keywords"]').length > 0) {
                item.keywords = $('meta[name="news_keywords"]').attr('content');
              } else if ($('meta[name="keywords"]').length > 0) {
                item.keywords = $('meta[name="keywords"]').attr('content');
              } else if ($('meta[property="keywords"]').length > 0) {
                item.keywords = $('meta[property="keywords"]').attr('content');
              } else if ($('meta[name="article:tag"]').length > 0) {
                item.keywords = $('meta[name="article:tag"]').attr('content');
              } else if ($('meta[name="sailthru.tags"]').length > 0) {
                item.keywords = $('meta[name="sailthru.tags"]').attr('content');
              }
            }
            if (item.author === '') {
              if ($('meta[name="author"]').length > 0) {
                item.author = $('meta[name="author"]').attr('content');
              } else if ($('span[itemprop="name"]').length > 0) {
                item.author = $('meta[itemprop="name"]').text();
              }
            }
            if ($('meta[name="thumbnail"]').length > 0) {
              item.img = $('meta[name="thumbnail"]').attr('content');
            } else if ($('meta[property="og:image:url"]').length > 0) {
              item.img = $('meta[property="og:image:url"]').attr('content');
            } else if ($('meta[property="og:image"]').length > 0) {
              item.img = $('meta[property="og:image"]').attr('content');
            } else if ($('meta[property="og:image:secure_url"]').length > 0) {
              item.img = $('meta[property="og:image:secure_url"').attr('content');
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
        reject({ item, error: err });
        console.log('Item with error: ', item.url, err.statusCode);
      });
  });
};

let fetchFeedEntry = async items => {
  let itemsArray = await Promise.all(items.map(makeRequests));
  return itemsArray;
};

let updateFeedItem = (item, rollbar) => {
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
            rollbar.log(err);
          });
      })
      .catch(e => {
        rollbar.log(e);
      });
  });
};

let moveUniqueFeedItem = (item, rollbar) => {
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
            rollbar.log(err);
          });
      })
      .catch(e => {
        rollbar.log(e);
      });
  });
};

function redirectOn302(body, response, resolveWithFullResponse) {
  if (response.statusCode === 302 || response.statusCode === 301) {
    // Set the new url (this is the options object)
    this.url = response.headers['location'];
    // console.log(response);
    return rp(options);
  } else {
    return resolveWithFullResponse ? response : body;
  }
}

let updateWithAuthorAndKeywords = item => {
  console.log('this is the url : ----- ', item.url);
  // var curlOpts = curl.opts.follow_redirects().max_redirs(5);
  // .connect_timeout(3);

  return new Promise((resolve, reject) => {
    rp(item.url)
      .then(res => {
        let $ = cheerio.load(res, {
          withDomLvl1: true,
          normalizeWhitespace: true,
          xmlMode: true,
          decodeEntities: true
        });
        if (item.provider === 'The Verge') {
          if (!item.description) {
            item.description = $('meta[name="description"]').attr('content');
          }
          if (!item.keywords) {
            item.keywords = $('meta[name="sailthru.tags"]').attr('content');
          }
          if (!item.author) {
            item.author = $('meta[property="author"]').attr('content');
          }
          if (!item.img) {
            item.img = $('meta[property="og:image"]').attr('content');
          }
        } else if (item.provider === 'MIT Technology Review') {
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
        console.log(err);
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

module.exports = {
  getProviderFeed,
  getFeedItems,
  getRSSFeedProviders,
  saveRssFeed,
  fetchItems,
  fetchFeedEntry,
  updateFeedItem,
  updateWithAuthorAndKeywords,
  moveUniqueFeedItem,
  updateProviderFeedDateAndTime
};
