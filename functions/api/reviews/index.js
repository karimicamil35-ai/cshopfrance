import {json} from '../../_lib.js';
export async function onRequestGet({env}) {
  try {
    const result = await env.DB.prepare("SELECT review_rating,review_comment,reviewed_at FROM orders WHERE review_rating BETWEEN 1 AND 5 AND trim(coalesce(review_comment,'')) != '' ORDER BY reviewed_at DESC LIMIT 50").all();
    return json({reviews:result.results.map(review=>({rating:review.review_rating,comment:review.review_comment,reviewed_at:review.reviewed_at}))});
  } catch { return json({error:'Impossible de charger les avis.'},500); }
}
