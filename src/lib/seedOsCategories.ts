import type { DutyType, DutyVariant, PersonTag } from '../types'
import { uid } from './id'

type Seed = Omit<DutyType, 'id' | 'archived' | 'order' | 'color'>

function v(
  name: string,
  short: string,
  points = 1,
  children?: DutyVariant[],
): DutyVariant {
  return {
    id: uid(),
    name,
    short: short.slice(0, 8),
    points,
    ...(children && children.length ? { children } : {}),
  }
}

function base(
  name: string,
  short: string,
  opts: Partial<Seed> & { requireTags?: PersonTag[]; excludeTags?: PersonTag[] } = {},
): Seed {
  return {
    name,
    short,
    points: opts.points ?? 1,
    defaultSlots: opts.defaultSlots ?? 1,
    allowExtraPerson: opts.allowExtraPerson ?? false,
    excludeTags: opts.excludeTags ?? [],
    requireTags: opts.requireTags ?? [],
    variants: opts.variants ?? [],
    scope: opts.scope ?? 'duties',
    cadenceMode: opts.cadenceMode ?? 'minGap',
    cadenceDays: opts.cadenceDays ?? 0,
    periodicityDays: opts.periodicityDays ?? 0,
    group: opts.group ?? '',
    isMainDuty: opts.isMainDuty ?? false,
    durationDays: opts.durationDays ?? 1,
    blocksFullDay: opts.blocksFullDay ?? false,
  }
}

const KG_KV: PersonTag[] = ['groupCommander', 'commander']
const FEMALE: PersonTag[] = ['female']

/**
 * Шаблон категорій о/с → види нарядів (Н, ЧАУД, ПГД, ЗАХ).
 * Статуси З/с, В/н, Л/р, В, Вд, Зв, Ш — у картці людини.
 */
export function osTaxonomyDutySeed(): Seed[] {
  const nDuty = (name: string, short: string, who: 'os' | 'kgkv' | 'female'): Seed =>
    base(name, short, {
      points: 1,
      defaultSlots: 1,
      requireTags: who === 'kgkv' ? KG_KV : who === 'female' ? FEMALE : [],
      blocksFullDay: true,
    })

  return [
    nDuty('Черговий курсу', 'ЧК', 'kgkv'),
    nDuty('Днювальний курсу', 'ДК', 'os'),
    nDuty('Чергова жіночого гуртожитку', 'ЧЖГ', 'female'),
    nDuty('Днювальна жіночого гуртожитку', 'ДЖГ', 'female'),
    nDuty('Командир чергового підрозділу', 'КЧП', 'kgkv'),
    nDuty('Склад чергового підрозділу', 'СЧП', 'os'),
    nDuty('Командир бойового розподілу', 'КБР', 'kgkv'),
    nDuty('Склад бойового розподілу', 'СБР', 'os'),
    nDuty('Відповідальний сержант', 'В С-Т', 'kgkv'),
    nDuty('Черговий 27 навчального корпусу', 'Ч27НК', 'kgkv'),
    nDuty('Помічник чергового 27 НК', 'ПЧ27НК', 'os'),

    base('Черговий аудиторії', 'ЧАУД', { points: 1, defaultSlots: 1 }),

    base('ПГД — пости / місця', 'ПГД', {
      points: 1,
      defaultSlots: 1,
      variants: [
        v('Гуртожиток № 12', 'Г12', 1, [
          v('Центральний прохід', 'ЦП'),
          v('Туалет', 'WC'),
          v('Кімната для вмивання', 'КдВ'),
          v('Сходи', 'Сх'),
        ]),
        v('27 навчальний корпус', '27НК', 1, [
          v('СК2 (102, 106, 310 ауд.)', 'СК2'),
          v('Кімната чергового інституту', 'КЧІ'),
          v('Кімната відпочинку добового наряду інституту', 'КВДНІ'),
          v('Плац + 2 курилки', 'П'),
        ]),
        v('Амбулаторія', 'АМБ'),
        v('Укриття', 'Укр', 1, [
          v('Гуртожиток № 20', 'Г20'),
          v('Гуртожиток № 8', 'Г8'),
          v('Гуртожиток № 12', 'Г12'),
          v('31 навчальний корпус', '31НК'),
        ]),
      ],
    }),

    base('Заходи', 'ЗАХ', {
      points: 1,
      defaultSlots: 1,
      variants: [
        v('Музей', 'М'),
        v('Бібліотека', 'Бібл'),
        v('Концерт', 'Конц'),
        v('Цирк', 'Ц'),
        v('Зоопарк', 'Зоо'),
        v('Театр', 'Т'),
        v('День відкритих дверей', 'ДВД'),
        v('Художня галерея', 'ХудГал'),
      ],
    }),

    base('Черговий (Миропіль)', 'ЧМ', {
      scope: 'myropil',
      points: 2,
      cadenceMode: 'maxStreak',
      cadenceDays: 2,
    }),
  ]
}

export const OS_STATUS_HELP = [
  'З/с — за списком',
  'В/н — в наявності',
  'Н — наряд (ЧК, ДК, ЧЖГ, ДЖГ, КЧП, СЧП, КБР, СБР, В С-Т, Ч27НК, ПЧ27НК)',
  'Л/р — ліжковий режим',
  'В — відпустка · Вд — відрядження · Зв — звільнення · Ш — шпиталь',
  'ЧАУД · ПГД · ЗАХ — види нарядів / місць / заходів',
] as const
