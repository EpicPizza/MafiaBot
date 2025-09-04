import dotenv from 'dotenv';
import { register } from './register';
import { disable } from './disable';

dotenv.config();

disable();
register(true);
