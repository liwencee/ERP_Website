import 'express-async-errors';
import express from 'express';
import path from 'path';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import flash from 'connect-flash';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

import sessionConfig from './config/session';
import logger from './utils/logger';
import router from './routes';
import localsMiddleware from './middleware/locals.middleware';

const app = express();
const PORT = process.env.PORT || 3000;

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://js.paystack.co'],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));
app.use(hpp());
app.use(cors({ origin: process.env.APP_URL, credentials: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests, please try again later.',
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session & flash
app.use(session(sessionConfig));
app.use(flash());

// Logging
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Inject res.locals
app.use(localsMiddleware);

// Routes
app.use(router);

// 404
app.use((_req, res) => {
  res.status(404).render('errors/404', { title: 'Page Not Found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err.stack || err.message);
  res.status(500).render('errors/500', { title: 'Server Error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`EPR Access server running on http://localhost:${PORT}`);
  });
}

export default app;
