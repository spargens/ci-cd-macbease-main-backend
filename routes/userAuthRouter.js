const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'userImage');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });
const {
  loginUser,
  registerUser,
  recoveryEmail,
  setOtp,
  setNewPassword,
  pushToken,
  userNameAvailable,
  emailVerification,
  regenerateAccessToken,
  generateAbout,
  generateResearchAreas,
  generateInterest,
  reactivateAccount,
} = require('../controllers/userAuthControllers');

router.post('/register', upload.single('image'), registerUser);
router.post('/login', loginUser);
router.post('/recoveryEmail', recoveryEmail);
router.post('/setOtp', setOtp);
router.post('/setNewPassword', setNewPassword);
router.get('/pushToken', pushToken);
router.get('/userNameAvailable', userNameAvailable);
router.get('/emailVerification', emailVerification);
router.post(
  '/regenerateAccessToken-72f8c570-2a36-11ec-8d3d-0242ac130003',
  regenerateAccessToken
);
router.post('/generateAbout', generateAbout);
router.get('/generateResearchAreas', generateResearchAreas);
router.post('/generateInterest', generateInterest);
router.post('/reactivateAccount', reactivateAccount);

module.exports = router;
