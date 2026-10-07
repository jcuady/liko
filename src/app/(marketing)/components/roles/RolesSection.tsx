import { SectionHeader } from '../SectionHeader';
import { RolesPan } from './RolesPan';

export function RolesSection() {
  return (
    <section
      id="roles"
      aria-labelledby="roles-title"
      className="border-y border-border bg-surface-sunken"
    >
      <div className="pb-16 pt-20 md:pb-20 md:pt-28">
        <div className="container-marketing">
          <SectionHeader
            label="By level"
            id="roles-title"
            title="One product, three different jobs."
          >
            <p className="measure text-lead">
              A preschool observation and a university GPA are not the same
              problem. The workflow adapts; the tool does not change.
            </p>
          </SectionHeader>
        </div>
      </div>

      <RolesPan className="pb-20 md:pb-28" />
    </section>
  );
}