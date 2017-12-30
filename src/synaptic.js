const synaptic = require('synaptic');
const trainingdata = require('./trainingdata');
const Redis = require('./redis');
const Mongo = require('./mongodb');

let getNetwork = () => {
  return Redis.getRedis('SynapticBrain').then(NW => {
    if (!NW) {
      throw new Error('No Network to work with...');
    } else {
      console.log('I am getting network from Cache...');
      return synaptic.Network.fromJSON(NW);
    }
  });
};

function maxarg(array) {
  return array.indexOf(Math.max.apply(Math, array));
}

let classifyDocs = async doc => {
  let result = await Promise.all([
    Redis.getRedis('dictionary'),
    Redis.getRedis('categoryMap'),
    getNetwork()
  ]);
  let dictionary = result[0];
  let categoryMap = result[1];
  let categoryArray = Object.keys(categoryMap);
  let testDoc = trainingdata.convertToVector(doc, dictionary);
  let NW = result[2];
  doc.category = categoryArray[maxarg(NW.activate(testDoc))];
  doc.status = 'review';
  return doc;
};

let createNetwork = () => {
  let Network = synaptic.Network;
  const Layer = synaptic.Layer;

  const inputLayer = new Layer(700);
  const hiddenLayer = new Layer(350);
  const outputLayer = new Layer(25);

  inputLayer.project(hiddenLayer);
  hiddenLayer.project(outputLayer);

  let myNetwork = new Network({
    input: inputLayer,
    hidden: [hiddenLayer],
    output: outputLayer
  });
  Redis.setRedis('SynapticBrain', JSON.stringify(myNetwork));
};

function vec_result(res, num_classes) {
  var i = 0,
    vec = [];
  for (i; i < num_classes; i += 1) {
    vec.push(0);
  }
  vec[res] = 1;
  return vec;
}

let trainNetwork = async () => {
  let result = await Promise.all([
    Redis.getRedis('numberOfCategories'),
    Redis.getRedis('dictionary'),
    MongoDB.getDocuments('feeditems', { status: 'classified' }),
    Redis.getRedis('categoryMap'),
    getNetwork()
  ]);
  let NW = result[4];
  const Trainer = synaptic.Trainer;
  let numberOfCategories = result[0];
  let classifiedDocs = result[2];
  let dictionary = result[1];
  let categoryMap = result[3];

  let tData = await trainingdata.formattedData(classifiedDocs, dictionary);

  console.log('Got all moving parts...');
  console.log('training data size: ', tData.length);
  let trainData = tData.map(pair => {
    return {
      input: pair.input,
      output: vec_result(categoryMap[pair.output], numberOfCategories)
    };
  });

  console.log('trainingData created...');
  // let trainer = new Trainer(NW);

  console.log('train the Networks ...');

  //train the network
  var learningRate = 0.001;
  for (var i = 0; i <= 5000; i++) {
    trainData.map(t => {
      NW.activate(t.input);
      NW.propagate(learningRate, t.output);
    });
    console.log('Iterations completed: ', i);
  }
  Redis.setRedis('SynapticBrain1', JSON.stringify(NW));
  Mongo.insertDocument('brain', NW.toJSON()).then(res => {
    console.log('Network saved in Mongo...', res.ops);
  });
  console.log('Network Trained...');
};

module.exports = {
  createNetwork,
  getNetwork,
  trainNetwork,
  classifyDocs
};
