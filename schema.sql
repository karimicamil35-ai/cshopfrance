export default {
  async scheduled(_, env) {
    const due = await env.DB.prepare("SELECT id, product FROM orders WHERE status='receipt_confirmation' AND receipt_due_at <= datetime('now')").all();
    for (const order of due.results) {
      if (env.DISCORD_SALES_WEBHOOK) await fetch(env.DISCORD_SALES_WEBHOOK,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({embeds:[{title:'Nouvelle vente C‑Shop',color:16737536,fields:[{name:'Produit',value:order.product},{name:'Avis client',value:'Client n’a pas donné d’avis après 24 h.'}],footer:{text:'Publication anonyme'}}]})});
      await env.DB.prepare("UPDATE orders SET status='closed', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(order.id).run();
    }
  }
};
