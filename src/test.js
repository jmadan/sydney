'use strict';
const rp = require('request-promise');

function test(url) {
  rp(url)
    .then(res => {
      console.log(res.headers);
    })
    .catch(err => {
      console.log('err: ', err);
    });
}

// test(
//   'http://feedproxy.google.com/~r/brainpickings/rss/~3/zhi4pN-4wqc/brainpicker'
// );

test('http://feedproxy.google.com/~r/Techcrunch/~3/vtRNy0DYp3E/');
