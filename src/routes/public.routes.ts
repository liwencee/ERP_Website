import { Router } from 'express';
import * as pages from '../controllers/public/pages.controller';
import * as chatbot from '../controllers/public/chatbot.controller';

const router = Router();

router.get('/', pages.home);
router.get('/about', pages.about);
router.get('/services', pages.services);
router.get('/real-estate', pages.realEstate);
router.get('/investment-plans', pages.investmentPlans);
router.get('/team', pages.team);
router.get('/compliance', pages.compliance);
router.get('/contact', pages.contactGet);
router.post('/contact', pages.contactPost);
router.post('/api/chat', chatbot.reply);

export default router;
