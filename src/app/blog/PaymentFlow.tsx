export function PaymentFlow() {
  return (
    <figure className="blog-flow" data-ui aria-label="Monifyd payment status flow: awaiting payment, payment detected, confirming, and paid">
      <div className="blog-flow-heading">
        <span>Checkout status</span>
        <span className="blog-flow-live"><i aria-hidden="true" /> On-chain tracking</span>
      </div>
      <ol>
        <li><span className="blog-flow-mark">1</span><span>Awaiting payment</span></li>
        <li><span className="blog-flow-mark">2</span><span>Payment detected</span></li>
        <li><span className="blog-flow-mark">3</span><span>Confirming</span></li>
        <li><span className="blog-flow-mark blog-flow-complete">4</span><span>Paid</span></li>
      </ol>
      <figcaption>One request, from checkout to confirmed.</figcaption>
    </figure>
  );
}
