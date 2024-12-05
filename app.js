require('dotenv').config();
const cors = require('cors');
const express = require('express');
const admin = require('firebase-admin');

const socketIo = require('socket.io');
const http = require('http');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

module.exports = io;

const connectDB = require('./db/connect');
const authenticate = require('./middlewares/authentication');
const userAuthRouter = require('./routes/userAuthRouter');
const userRouter = require('./routes/userRouter');
const frontendRouter = require('./routes/frontendRouter');
const adminAuthRouter = require('./routes/adminAuthRouter');
const eventRouter = require('./routes/eventRouter');
const clubRouter = require('./routes/clubRouter');
const propsRouter = require('./routes/propsRouters');
const cardRouter = require('./routes/cardRouter');
const bagRouter = require('./routes/bagRouter');
const communityRouter = require('./routes/communityRouter');
const contentRouter = require('./routes/contentRouter');
const tileRouter = require('./routes/tileRouter');
const paymentRouter = require('./routes/paymentRouter');
const chatRouter = require('./routes/chatRouter');
const macbeaseContentRouter = require('./routes/macbeaseContentRouter');
const shortCutRouter = require('./routes/shortCutRouter');
const letterRouter = require('./routes/letterRouter');
const invitationRouter = require('./routes/invitationRouter');
const ticketRouter = require('./routes/ticketRouter');
const badgeRouter = require('./routes/badgeRouter');
const contentModerationRouter = require('./routes/contentModerationRouter');
const resourceRouter = require('./routes/resourceRouter');

app.use(cors());
app.use(express.json());

const serviceAccount = require('./macbease-57286f7a0321.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.get('/', (req, res) => {
  res.send(
    'My mother always used to say: The older you get, the better you get, unless you’re a banana.'
  );
});

app.use('/api/v1/auth/user', userAuthRouter);
app.use('/api/v1/user', authenticate, userRouter);
app.use('/api/v1/frontend', authenticate, frontendRouter);
app.use('/api/v1/admin', adminAuthRouter);
app.use('/api/v1/event', authenticate, eventRouter);
app.use('/api/v1/club', authenticate, clubRouter);
app.use('/api/v1/props', authenticate, propsRouter);
app.use('/api/v1/card', authenticate, cardRouter);
app.use('/api/v1/bag', authenticate, bagRouter);
app.use('/api/v1/community', authenticate, communityRouter);
app.use('/api/v1/content', authenticate, contentRouter);
app.use('/api/v1/tile', authenticate, tileRouter);
app.use('/api/v1/payment', paymentRouter);
app.use('/api/v1/chat', authenticate, chatRouter);
app.use('/api/v1/macbeaseContent', authenticate, macbeaseContentRouter);
app.use('/api/v1/shortCuts', authenticate, shortCutRouter);
app.use('/api/v1/letter', authenticate, letterRouter);
app.use('/api/v1/invitation', authenticate, invitationRouter);
app.use('/api/v1/ticket', authenticate, ticketRouter);
app.use('/api/v1/badge', authenticate, badgeRouter);
app.use('/api/v1/contentModeration', authenticate, contentModerationRouter);
app.use('/api/v1/resource', authenticate, resourceRouter);

const port = process.env.PORT || 5050;
const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    io.on('connection', (socket) => {
      console.log('A user connected!');
      socket.on('disconnect', () => {
        console.log('A user disconnected');
      });
    });
    server.listen(port, () => {
      console.log(`Server is listening to port ${port}!`);
    });
  } catch (error) {
    console.log(error);
  }
};

start();
