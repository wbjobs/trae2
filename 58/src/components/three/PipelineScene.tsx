import { useScene } from '@/store/scene';
import type { PipelineType } from '@shared/types';
import { PIPELINE_TYPE_COLOR, PIPELINE_TYPE_LABEL } from '@shared/types';
import PipeMesh from './PipeMesh';

const TYPE_ORDER: PipelineType[] = [
  'water_supply',
  'drainage',
  'gas',
  'power',
  'telecom',
  'heating',
];

export default function PipelineScene() {
  const pipelines = useScene((s) => s.pipelines);
  const selectedType = useScene((s) => s.selectedType);
  const hiddenTypes = useScene((s) => s.hiddenTypes);

  return (
    <group>
      {TYPE_ORDER.flatMap((type) =>
        pipelines
          .filter(
            (p) =>
              p.type === type &&
              !hiddenTypes.has(type) &&
              (!selectedType || selectedType === type),
          )
          .map((p) => (
            <PipeMesh key={p.id} pipeline={p} />
          )),
      )}
    </group>
  );
}

export { PIPELINE_TYPE_COLOR, PIPELINE_TYPE_LABEL, TYPE_ORDER };
