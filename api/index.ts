// Vercel serverless entry point — imports the Express app and exports it
// so @vercel/node can wrap it as a serverless function handler.
import app from '../src/server';

export default app;
