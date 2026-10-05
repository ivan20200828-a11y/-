import { Text, View } from 'react-native';

import { buildSchedule, dealProgress } from '@/lib/schedule';
import { sellerIntro, sellerRequisites } from '@/lib/company';
import { formatDate, rub } from '@/lib/money';
import { downAmount, type Deal } from '@/state/types';

import { Pill, tableStyles, Txt } from './kit';
import { useColors } from './theme';

export function ScheduleTable({ deal, withStatus }: { deal: Deal; withStatus?: boolean }) {
  const c = useColors();
  const rows = buildSchedule(deal.total, downAmount(deal), deal.term, deal.signature?.at ?? new Date());
  const { paid, next, isLate } = dealProgress(deal);
  const cell = { color: c.fg, fontSize: 14, fontVariant: ['tabular-nums' as const] };
  return (
    <View>
      <View style={[tableStyles.row, { borderColor: c.line }]}>
        <Text style={[cell, { width: 28, color: c.muted, fontSize: 12 }]}>№</Text>
        <Text style={[cell, { flex: 1, color: c.muted, fontSize: 12 }]}>Дата</Text>
        <Text style={[cell, { flex: 1, color: c.muted, fontSize: 12, textAlign: 'right' }]}>Сумма</Text>
        {withStatus && <Text style={[cell, { width: 96, color: c.muted, fontSize: 12 }]}>Статус</Text>}
      </View>
      <View style={[tableStyles.row, { borderColor: c.line }]}>
        <Text style={[cell, { width: 28 }]}>0</Text>
        <Text style={[cell, { flex: 1 }]}>{deal.downPayment ? formatDate(deal.downPayment.at) : 'взнос'}</Text>
        <Text style={[cell, { flex: 1, textAlign: 'right' }]}>{rub(downAmount(deal))}</Text>
        {withStatus && <View style={{ width: 96 }}>{deal.downPayment ? <Pill kind="ok">Оплачен</Pill> : <Pill kind="acc">К оплате</Pill>}</View>}
      </View>
      {rows.map((r) => (
        <View key={r.n} style={[tableStyles.row, { borderColor: c.line }]}>
          <Text style={[cell, { width: 28 }]}>{r.n}</Text>
          <Text style={[cell, { flex: 1 }]}>{formatDate(r.date)}</Text>
          <Text style={[cell, { flex: 1, textAlign: 'right' }]}>{rub(r.amount)}</Text>
          {withStatus && (
            <View style={{ width: 96 }}>
              {paid.has(r.n) ? <Pill kind="ok">Оплачен</Pill> : isLate(r.n) ? <Pill kind="bad">Просрочен</Pill> : r.n === next?.n && deal.downPayment ? <Pill kind="acc">Следующий</Pill> : <Pill kind="wait">Ожидается</Pill>}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

export function ContractText({ deal }: { deal: Deal }) {
  const c = useColors();
  const p = deal.passport;
  const down = downAmount(deal);
  const seller = deal.sellerDetails;
  const P = ({ children }: { children: React.ReactNode }) => <Txt style={{ fontSize: 14, lineHeight: 21 }}>{children}</Txt>;
  const B = ({ children }: { children: React.ReactNode }) => <Text style={{ fontWeight: '700' }}>{children}</Text>;
  return (
    <View style={{ backgroundColor: c.sunk, borderColor: c.line, borderWidth: 1, borderRadius: 10, padding: 16, gap: 8 }}>
      <Txt style={{ fontWeight: '700', textAlign: 'center', fontSize: 14 }}>ДОГОВОР КУПЛИ-ПРОДАЖИ С РАССРОЧКОЙ ПЛАТЕЖА № {deal.no}</Txt>
      <P>г. {deal.city}, {formatDate(deal.signature?.at ?? new Date())}</P>
      <P>
        {seller ? sellerIntro(seller) : deal.seller}, именуемое «Продавец», и гражданин(ка) РФ <B>{p?.fio ?? deal.clientName}</B>
        {p ? `, ${p.birth} г. р., паспорт ${p.series}, выдан ${p.issued} ${p.issuedAt}, зарегистрирован(а) по адресу: ${p.address}` : ''}
        , именуемый(ая) «Покупатель», заключили настоящий договор о нижеследующем.
      </P>
      <P><B>1. Предмет.</B> Продавец передаёт в собственность Покупателя: {deal.subject.replace(/\.$/, '')}.</P>
      <P>
        <B>2. Цена.</B> Цена составляет {rub(deal.total)}. Первоначальный взнос {rub(down)} оплачивается в течение 3 рабочих дней после подписания.
        Остаток {rub(deal.total - down)} оплачивается в рассрочку на {deal.term} мес. согласно Приложению № 1, без процентов.
      </P>
      <P><B>3. Подписание.</B> Договор подписывается простой электронной подписью (кодом из SMS) в порядке, установленном Соглашением об использовании простой электронной подписи (Приложение № 2). Стороны признают такую подпись равнозначной собственноручной в соответствии с Федеральным законом № 63-ФЗ «Об электронной подписи».</P>
      <P><B>4. Просрочка.</B> За просрочку платежа начисляется неустойка 0,1% от суммы просроченного платежа за каждый день.</P>
      {seller && (
        <>
          <P><B>5. Реквизиты сторон.</B></P>
          <P><B>Продавец:</B>{'\n'}{sellerRequisites(seller).join('\n')}</P>
          <P><B>Покупатель:</B>{'\n'}{buyerRequisites(deal).join('\n')}</P>
        </>
      )}
      <P><B>Приложение № 1. График платежей</B></P>
      <ScheduleTable deal={deal} />
    </View>
  );
}

function buyerRequisites(deal: Deal) {
  const p = deal.passport;
  return [
    p?.fio ?? deal.clientName,
    p && `Паспорт ${p.series}, выдан ${p.issued} ${p.issuedAt}`,
    p && `Адрес регистрации: ${p.address}`,
    `Телефон: ${deal.phone}`,
  ].filter(Boolean) as string[];
}
