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
        'MERGE (a:ARTICLE {id: $id}) \
        ON CREATE SET a.title=$title, a.url=$url, a.keywords=$keywords \
        ON MATCH SET a.title=$title, a.url=$url, a.keywords=$keywords RETURN a';
    } else {
      query =
        'MERGE (a:ARTICLE {id: $id}) \
        ON CREATE SET a.title=$title, a.url=$url \
        ON MATCH SET a.title=$title, a.url=$url RETURN a';
    }
    session
      .run(query, {
        id: article._id.toString(),
        title: article.title,
        url: article.url,
        keywords: article.keywords ? article.keywords.toString() : ''
      })
      .then(result => {
        session.close();
        resolve({ result });
      })
      .catch(err => reject(err));
  });
};

let articleCategoryRelationship = article => {
  const session = driver.session();
  let query =
    'MERGE (c:CATEGORY {id: $categoryId}) WITH c \
    MATCH (a:ARTICLE {id: $id}) \
    CREATE (a)-[r:HAS_CATEGORY]->(c) RETURN a,r';
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

let articleSubCategoryRelationship = article => {
  const session = driver.session();
  let query =
    'MERGE (c:CATEGORY {id: $categoryId}) \
    ON CREATE SET c.name=$subcategory_name  WITH c \
    MATCH (a:ARTICLE {id: $id}) \
    CREATE (a)-[r:HAS_CATEGORY]->(c) RETURN a,r';
  session
    .run(query, {
      id: article._id.toString(),
      categoryId: article.subcategory._id.toString(),
      subcategory_name: article.subcategory.name.toString()
    })
    .then(result => {
      session.close();
      console.log('Article node and Relationship created.');
      console.log(result.records[0]);
    })
    .catch(err => console.log(err));
};

let articleAuthorRelationship = (author, articleId) => {
  const session = driver.session();
  let query = null;
  if (author) {
    query =
      'MERGE (au:AUTHOR {name: $author}) WITH au \
      MATCH (a:ARTICLE {id: $id}) \
      CREATE (a)-[r:AUTHORED_BY]->(au) RETURN a, r';
  } else {
    query = 'MATCH (a:ARTICLE {id: $id}) RETURN a';
  }
  session
    .run(query, {
      id: articleId.toString(),
      author: author ? author.toString() : ''
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
    'MERGE (p:PROVIDER {name: $provider}) WITH p \
    MATCH (a:ARTICLE {id: $id}) \
    CREATE (a)-[r:PUBLISHED_BY {pubDate: $published_date}]->(p) RETURN a, r';
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
  articleProviderRelationship,
  articleSubCategoryRelationship
};
