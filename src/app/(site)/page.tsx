import {
  BadgeCheck, BarChart3, Boxes, Coins, FileStack, Mail, ReceiptText, RotateCcw, ShieldCheck, Sparkles, Stethoscope, Users, type LucideIcon,
} from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import s from '@/components/site/site.module.css';
import { getBrand } from '@/server/brand';

const CORE: { icon: LucideIcon; title: string; text: string; wide?: boolean }[] = [
  { icon: Boxes, title: 'Inventory', text: 'Products with codes, units, prices and live stock. Low-stock alerts per shop.', wide: true },
  { icon: ReceiptText, title: 'Sales & purchases', text: 'Invoices with item and invoice-level VAT and discounts, part payments and printable receipts.', wide: true },
  { icon: RotateCcw, title: 'Returns & exchanges', text: 'Refunds with reasons and item condition; damaged goods are kept out of sellable stock.' },
  { icon: Coins, title: 'Dues & expenses', text: 'Track what customers owe, what you owe suppliers, and every expense — then collect.' },
  { icon: Users, title: 'Staff', text: 'Staff accounts with per-section permissions, daily attendance and salary payments.' },
  { icon: BarChart3, title: 'Reports', text: 'Sales, purchases, expenses and dues by period, with a dashboard for every shop.', wide: true },
  { icon: ShieldCheck, title: 'Shop isolation', text: 'Every record belongs to one shop. Staff only ever see the shop they work in.', wide: true },
];

const ADDONS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Mail, title: 'ConnectX', text: 'Email invoices and messages to customers and suppliers; SMS through your own Android phone with Connect App.' },
  { icon: Sparkles, title: 'Zudo AI', text: 'Ask questions about your shop in plain language — answered from your own data, read-only.' },
  { icon: Stethoscope, title: 'AI Business Health', text: 'A health score for any period with written advice on sales, stock, dues and costs.' },
  { icon: BadgeCheck, title: 'TrueBill', text: 'A QR code on each invoice, return and exchange so customers can verify it is genuine.' },
  { icon: FileStack, title: 'Vaultium', text: 'Keep invoice and expense documents with the records they belong to.' },
];

export default async function Home() {
  const brand = await getBrand();
  return (
    <>
      <section className={s.hero}>
        <div className={`${s.container} ${s.heroInner}`}>
          <span className={s.eyebrow}>Multi-shop management</span>
          <h1 className={s.title}>
            Run every shop from <em>one place</em>.
          </h1>
          <p className={s.lead}>
            {brand.product_name} brings stock, sales, purchases, returns, dues, expenses and staff together — for one shop or many, with a
            licence that grows with your business.
          </p>
          <div className={s.ctas}>
            <ButtonLink href="/register" variant="primary">
              Create an administrator account
            </ButtonLink>
            <ButtonLink href="/pricing">See licence plans</ButtonLink>
          </div>
        </div>
      </section>

      <section id="features" className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.container}>
          <div className={s.sectionHead}>
            <h2 className={s.h2}>Everything a shop runs on</h2>
            <p className={s.muted}>The core of {brand.product_name} is included with every licence.</p>
          </div>
          <div className={s.bento}>
            {CORE.map(({ icon: Icon, title, text, wide }, i) => (
              <article key={title} className={`${s.tile} ${wide ? s.tileWide : ''}`} style={{ animationDelay: `${i * 40}ms` }}>
                <Icon aria-hidden />
                <h3 className={s.tileTitle}>{title}</h3>
                <p className={s.tileText}>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.container}>
          <div className={s.sectionHead}>
            <h2 className={s.h2}>Add-ons when you need them</h2>
            <p className={s.muted}>Included in some licence plans or added separately for the days you need them.</p>
          </div>
          <div className={s.bento}>
            {ADDONS.map(({ icon: Icon, title, text }) => (
              <article key={title} className={s.tile}>
                <Icon aria-hidden />
                <span className={s.tag}>Add-on</span>
                <h3 className={s.tileTitle}>{title}</h3>
                <p className={s.tileText}>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionAlt}`}>
        <div className={s.container}>
          <div className={s.sectionHead}>
            <h2 className={s.h2}>How it works</h2>
          </div>
          <ol className={s.steps}>
            <li className={s.step}>
              <p className={s.stepTitle}>Create your account</p>
              <p className={s.muted}>Register as an administrator — the owner of one or more shops.</p>
            </li>
            <li className={s.step}>
              <p className={s.stepTitle}>Choose a licence</p>
              <p className={s.muted}>Pick a plan for the number of shops you run. It is activated once payment is confirmed.</p>
            </li>
            <li className={s.step}>
              <p className={s.stepTitle}>Open your shops</p>
              <p className={s.muted}>Each shop gets its own 4-digit Shop ID and its own records.</p>
            </li>
            <li className={s.step}>
              <p className={s.stepTitle}>Invite your staff</p>
              <p className={s.muted}>Staff sign in with the Shop ID and their user ID, and see only what you allow.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className={s.section}>
        <div className={`${s.container} ${s.heroInner}`}>
          <h2 className={s.h2}>Ready to set up your first shop?</h2>
          <div className={s.ctas}>
            <ButtonLink href="/register" variant="primary">
              Get started
            </ButtonLink>
            <ButtonLink href="/contact">Talk to us</ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
