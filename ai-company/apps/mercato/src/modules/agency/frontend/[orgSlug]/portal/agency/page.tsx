"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import Link from 'next/link'
import { Button } from '@open-mercato/ui/primitives/button'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard, PortalCardHeader } from '@open-mercato/ui/portal/components/PortalCard'

type Props = { params: { orgSlug: string } }

const included: string[] = [
  'Wnioski z audytu strony i jednego profilu społecznościowego oraz porównania z maksymalnie trzema firmami z kategorii.',
  'Brief z uzupełnionymi informacjami i pytaniami o Twój cel, odbiorców i priorytety.',
  'Jeden rekomendowany kierunek komunikacji: propozycję wartości, argumentację opartą na dowodach i filary tematyczne.',
  'Tone of voice: praktyczne zasady języka marki z przykładami.',
  'Plan 12 tematów na 30 dni w jednym kanale.',
  'Jeden wybrany post tekstowy przygotowany do Twojej akceptacji oraz jego publikację w uzgodnionym kanale.',
  'Komplet materiałów i link do opublikowanego tekstu.',
]

const boundaries: string[] = [
  'Pakiet obejmuje jedną markę, jeden rynek, jeden język i jeden kanał.',
  'Plan tematów nie oznacza przygotowania dwunastu gotowych postów.',
  'Bez badań pierwotnych odbiorców, kampanii reklamowych, grafiki, video, newslettera, monitoringu ani gwarancji leadów.',
  'Poprawki w ramach zamówienia są bez limitu rund. Dodatkowy post, marka, język lub publikacja to odrębna usługa.',
]

export default function AgencyOfferPage({ params }: Props) {
  const t = useT()
  const { orgSlug } = params
  const orderHref = `/${orgSlug}/portal/agency/order`

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Button asChild variant="outline"><Link href={`/${orgSlug}/portal/agency/materials`}>{t('agency.materials.link')}</Link></Button>
      <PortalPageHeader
        label="Oferta"
        title="START KOMUNIKACJI"
        description="Kierunek komunikacji marki, plan treści i pierwszy gotowy post — przygotowane przez agentów AI, zatwierdzane przez Ciebie."
        action={
          <Link href={orderHref}>
            <Button>Zamów</Button>
          </Link>
        }
      />

      <PortalCard>
        <PortalCardHeader
          label="Cena pilotażowa"
          title="2500 PLN netto"
          description="Jednorazowo · 1 marka · 1 rynek · 1 język · 1 kanał"
        />
        <p className="text-sm text-muted-foreground">
          Dla firmy, która chce uporządkować sposób przedstawiania swojej wartości i przejść od
          rozproszonych materiałów do konkretnej komunikacji.
        </p>
      </PortalCard>

      <PortalCard>
        <PortalCardHeader title="Co otrzymujesz" />
        <ul className="list-disc space-y-2 pl-5 text-sm text-foreground">
          {included.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </PortalCard>

      <PortalCard>
        <PortalCardHeader title="Jak pracujemy" />
        <p className="text-sm text-muted-foreground">
          Po zakupie analizujemy dostępne materiały i przedstawiamy wstępnie uzupełniony brief.
          Prosimy o decyzje, których nie da się wyczytać ze strony: co promować, komu i w jakim celu.
          Następnie agenci przygotowują strategię, język, plan i post. Akceptujesz konkretne wersje
          rezultatów. Publikacja wymaga Twojej zgody na tekst i wskazane miejsce.
        </p>
      </PortalCard>

      <PortalCard>
        <PortalCardHeader title="Granice pakietu" />
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {boundaries.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </PortalCard>

      <div className="flex justify-end">
        <Link href={orderHref}>
          <Button size="lg">Zamów START KOMUNIKACJI</Button>
        </Link>
      </div>
    </div>
  )
}
