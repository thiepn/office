import {startOffice,showBootError} from './app.js';
// Production entry point intentionally does not load Account SDK or credentials.
startOffice(null).catch(showBootError);
