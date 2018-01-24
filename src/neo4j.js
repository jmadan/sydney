const neo4j = require('neo4j-driver').v1;

const driver = neo4j.driver(
  process.env.NEO4J_URL,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

let createArticle = article => {
  const session = driver.session();
  return new Promise((resolve, reject) => {
    session
      .run(
        'CREATE (a:ARTICLE {id: $id, title: $title, url: $url, keywords: $keywords}) \
        MERGE (author:AUTHOR {name: $author}) \
        MERGE (a)-[r:AUTHORED_BY]->(author) \
        MERGE (provider:PROVIDER {name: $provider}) \
        MERGE (a)-[ap:PUBLISHED_BY]->(provider) \
        ON CREATE SET ap.published_on=$pubDate \
        RETURN a',
        {
          id: article._id.toString(),
          title: article.title,
          provider: article.provider,
          author: article.author,
          pubDate: article.pubDate.toString(),
          url: article.url,
          keywords: article.keywords.toString()
        }
      )
      .then(result => {
        session.close();
        resolve({ msg: result.records[0] });
      })
      .catch(err => reject(err));
  });
};

let articleCategoryRelationship = article => {
  const session = driver.session();
  session
    .run(
      'MATCH (a:ARTICLE {id: $id}), (c:CATEGORY {id: $parentCat}) CREATE (a)-[r:HAS_CATEGORY]->(c) RETURN a',
      {
        id: article._id.toString(),
        parentCat: article.parentcat._id.toString()
      }
    )
    .then(result => {
      session.close();
      console.log('Article node and Relationship created.');
      console.log(result.records[0]);
    })
    .catch(err => console.log(err));
};

module.exports = {
  createArticle,
  articleCategoryRelationship
};
