import { SectionHeader } from '../SectionHeader';
import { FlowStickyStack } from './FlowStickyStack';

/**
 * The Flow chapter. Carries the page's single use of the inline typography
 * image: a small pill-shaped photo set into the headline, echoing the reference
 * composition.
 *
 * The asset is local, not hotlinked. The page is a PWA and this slot has to
 * render identically with no network, and a seeded placeholder host would put an
 * arbitrary photograph inside the headline.
 */
export function FlowSection() {
  return (
    <section id="flow" aria-labelledby="flow-title" className="chapter">
      <div className="container-marketing">
        <SectionHeader
          label="The Flow"
          id="flow-title"
          title={
            <>
              Nothing gets{' '}
              <span
                aria-hidden="true"
                className="mx-1 inline-block h-[0.62em] w-[1.6em] rounded-full bg-cover bg-center align-middle ring-1 ring-inset ring-black/[0.06]"
                style={{
                  backgroundImage: 'url(/marketing/liko-flow-pill.jpg)',
                }}
              />
              <span className="sr-only">retyped</span> between five stages.
            </>
          }
        >
          <p className="measure text-lead">
            Plan, create, assess, grade, analyze. Each stage hands its context to
            the next instead of starting over.
          </p>
        </SectionHeader>
      </div>

      <div className="container-marketing mt-16 md:mt-20">
        <FlowStickyStack />
      </div>
    </section>
  );
}