const mongoose = require('mongoose');
const clubSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide the name of the club.'],
  },
  motto: {
    type: String,
    required: [true, 'Please provide the motto of the club.'],
  },
  tags: {
    type: Array,
  },
  featuringImg: {
    type: String,
    required: [true, 'Please provide the motto of the club.'],
  },
  secondaryImg: {
    type: String,
  },
  //array of objects {url:"xyz.com",id:"ff232",desc:""}
  gallery: {
    type: Array,
  },
  //array of objects {url:"xyz.com",id:"ff232"}
  videos: {
    type: Array,
  },
  //url of a bg removed image to be featured on the top of the club page
  chiefImage: {
    type: String,
    required: [true, 'Please provide the motto of the club.'],
  },
  chiefMsg: {
    type: String,
    required: [true, 'Please provide the message of the chief.'],
  },
  //array of objects {id:"r3039fjf",url:"url",name:"eventName2023",description:"OneLiner",place:"sdma",time:"tomorrow 3pm to 5pm",postedBy:"idOfAdmin"}
  upcomingEvent: {
    type: Array,
  },
  //array of objects {id:"f34ef23",pos:"ceo"}
  team: {
    type: Array,
  },
  //array of number of members
  xAxisData: {
    type: Array,
    default: [0],
  },
  //array of dates
  yAxisData: {
    type: Array,
    default: [0],
  },
  members: {
    type: Array,
  },
  adminId: {
    type: Array,
  },
  mainAdmin: {
    type: String,
  },
  //[{id:"",msg:""}]
  notifications: {
    type: Array,
  },
  //[{contentId:"",postedBy:"adminId"}]
  content: {
    type: Array,
  },
  rating: {
    type: Number,
  },
  createdOn: {
    type: Date,
    default: new Date(),
  },
  unusedBadges: {
    type: Array,
  },
  usedBadges: {
    type: Array,
  },
  reviewBadges: {
    type: Array,
  },
  proposalHistory: {
    type: Array,
  },
  undecidedProposals: {
    type: Array,
  },
  pinnedBy: {
    type: Array,
  },
});

module.exports = mongoose.model('Club', clubSchema);
