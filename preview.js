document.addEventListener('DOMContentLoaded', async () => {
  const q = new URLSearchParams(location.search);
  let list = [];
  try { list = await loadProducts(); } catch(e) { list = (typeof seedProducts !== 'undefined' ? seedProducts : []); }
  const product = list.find(p => p.id === q.get('id')) || list[0];
  if(!product) { document.body.innerHTML = '<p style="padding:40px">Product not found. <a href="index.html">Back to shop</a></p>'; return; }
  document.getElementById('img').src = product.image || '';
  document.getElementById('img').alt = product.name || 'Product';
  document.getElementById('name').textContent = product.name || '';
  document.getElementById('cat').textContent = product.category || '';
  document.getElementById('price').textContent = 'Rs. ' + Number(product.price||0).toLocaleString('en-PK');
  document.getElementById('desc').textContent = product.description || '';
  document.getElementById('add').onclick = () => {
    let cart=[]; try { cart=JSON.parse(localStorage.getItem('afs-cart-static')||'[]'); } catch(e){}
    cart.push({id:product.id,name:product.name,image:product.image,price:Number(product.price||0),options:[]});
    localStorage.setItem('afs-cart-static', JSON.stringify(cart));
    location.href='index.html';
  };
});
