const nlp = require('compromise');
const Bag = require('../models/bag');

//function for lemmatization
function lemmatize(tags) {
  let lemmatized = [];
  for (let i = 0; i < tags.length; i++) {
    let tag = tags[i];
    let arr = tag.split(' ');
    let lemma = '';
    if (arr.length === 1) {
      const doc = nlp(tag);
      lemma = doc.verbs().toInfinitive().out();
      lemma = lemma.charAt(0).toUpperCase() + lemma.slice(1);
      if (!lemma) {
        lemma = tag;
      }
    } else {
      let len = arr.length;
      let lastWord = arr[len - 1];
      const doc = nlp(lastWord);
      lemma = doc.verbs().toInfinitive().out();
      lemma = lemma.charAt(0).toUpperCase() + lemma.slice(1);
      if (lemma) {
        arr[len - 1] = lemma;
      }
      lemma = arr.join(' ');
    }
    lemmatized.push(lemma);
  }
  return lemmatized;
}

//function to expand the horizon of tags
async function getRelatedTags(query) {
  try {
    if (!query || query.length === 0) {
      return [];
    }
    const validQuery = query.filter(
      (keyWord) => keyWord && keyWord.trim() !== ''
    );

    if (validQuery.length === 0) {
      return []; // No valid keywords
    }
    // Array of pipelines for all keywords
    const pipelines = query.map((keyWord) => ({
      $search: {
        index: 'default',
        text: {
          query: `${keyWord}`,
          path: ['keyWords'],
        },
      },
    }));

    // Execute all aggregation pipelines in parallel
    const results = await Promise.all(
      pipelines.map((pipeline) => Bag.aggregate([pipeline]))
    );

    // Use a Set to collect unique bag IDs and keywords
    const uniqueBags = new Set();
    const finalData = new Set();

    // Loop through results to collect unique bags and their keywords
    results.forEach((newBags) => {
      newBags.forEach((bag) => {
        const id = bag._id.toString();
        if (!uniqueBags.has(id)) {
          uniqueBags.add(id);
          bag.keyWords.forEach((keyword) => finalData.add(keyword));
        }
      });
    });

    // Ensure all original query keywords are in the final data
    query.forEach((keyword) => finalData.add(keyword));

    return Array.from(finalData);
  } catch (error) {
    console.error('Error in getRelatedTags:', error);
    throw error; // Re-throw the error to be handled upstream
  }
}

function formatDateToMonthDay(dateString) {
  const date = new Date(dateString);
  const options = { month: 'short', day: 'numeric' };
  return date.toLocaleString('en-US', options);
}

module.exports = {
  lemmatize,
  getRelatedTags,
  formatDateToMonthDay,
};
