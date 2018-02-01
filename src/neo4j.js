const neo4j = require('neo4j-driver').v1;

const driver = neo4j.driver(
  process.env.NEO4J_URL,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

let createArticle = article => {
  const session = driver.session();
  let query = null;

  return new Promise((resolve, reject) => {
    if (article.keywords) {
      query =
        'MERGE (a:ARTICLE {aid: $aid}) \
        ON CREATE SET a.title=$title, a.url=$url, a.keywords=$keywords \
        ON MATCH SET a.title=$title, a.url=$url, a.keywords=$keywords RETURN a';
      session
        .run(query, {
          aid: article._id.toString(),
          title: article.title,
          url: article.url,
          keywords: article.keywords.toString()
        })
        .then(result => {
          session.close();
          resolve({ msg: result.records[0] });
        })
        .catch(err => reject(err));
    } else {
      query =
        'MERGE (a:ARTICLE {aid: $aid}) \
        ON CREATE SET a.title=$title, a.url=$url \
        ON MATCH SET a.title=$title, a.url=$url RETURN a';
      session
        .run(query, {
          aid: article._id.toString(),
          title: article.title,
          url: article.url
        })
        .then(result => {
          session.close();
          resolve({ msg: result.records[0] });
        })
        .catch(err => reject(err));
    }
  });
};

let articleCategoryRelationship = article => {
  const session = driver.session();
  let query =
    'MERGE (a:ARTICLE {id: $id}) MERGE (c:CATEGORY {id: $categoryId}) CREATE (a)-[r:HAS_CATEGORY]->(c) RETURN r';
  session
    .run(query, {
      id: article._id.toString(),
      categoryId: article.parentcat._id.toString()
    })
    .then(result => {
      session.close();
      console.log('Article node and Relationship created.');
      console.log(result.records[0]);
    })
    .catch(err => console.log(err));
};

let articleAuthorRelationship = article => {
  const session = driver.session();
  let query = null;
  if (article.author) {
    query =
      'MERGE (a:ARTICLE {id: $id}) MERGE (au:AUTHOR {name: $author}) CREATE (a)-[r:AUTHORED_BY]->(au) RETURN r';
  } else {
    query = 'MERGE (a:ARTICLE {id: $id}) RETURN a';
  }
  session
    .run(query, {
      id: article._id.toString(),
      author: article.author.toString()
    })
    .then(result => {
      session.close();
      console.log('Article node and Relationship created.');
      console.log(result.records[0]);
    })
    .catch(err => console.log(err));
};

let articleProviderRelationship = article => {
  const session = driver.session();
  let query =
    'MERGE (a:ARTICLE {id: $id}) MERGE (p:PROVIDER {name: $provider}) CREATE (a)-[r:PUBLISHED_BY {pubDate: $published_date}]->(p) RETURN r';
  session
    .run(query, {
      id: article._id.toString(),
      provider: article.provider.toString(),
      published_date: article.pubDate.toString()
    })
    .then(result => {
      session.close();
      console.log('Article node and Relationship created.');
      console.log(result.records[0]);
    })
    .catch(err => console.log(err));
};

module.exports = {
  createArticle,
  articleCategoryRelationship,
  articleAuthorRelationship,
  articleProviderRelationship
};
