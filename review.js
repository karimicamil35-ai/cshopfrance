import {json,user} from '../../_lib.js';
export async function onRequestGet({request,env}){return json({user:await user(request,env)})}
