import type { CSSProperties } from 'react';
import {
  sisayksikkoImageUrl,
  sisayksikkoOverlayPositions,
  sisayksikkoSupportsSchematic,
  sisayksikkoTempOverlay,
} from '../../lib/huoltoRaportti/sisayksikkoTypes';
import type { MittausSisayksikkoData, SisayksikkoData } from '../../lib/huoltoRaportti/types';

interface Props {
  unit: Pick<SisayksikkoData, 'tyyppi' | 'huoneLampotila'>;
  mittaus?: Pick<MittausSisayksikkoData, 'sisalampotila' | 'puhallusLampotila' | 'paluuLampotila'>;
  className?: string;
}

function overlayStyle(anchor: { top?: string; bottom?: string; left?: string; right?: string }): CSSProperties {
  return {
    position: 'absolute',
    top: anchor.top,
    bottom: anchor.bottom,
    left: anchor.left,
    right: anchor.right,
    zIndex: 2,
    pointerEvents: 'none',
  };
}

export function SisayksikkoSchematicPreview({ unit, mittaus, className }: Props) {
  if (!sisayksikkoSupportsSchematic(unit.tyyppi)) {
    return (
      <p className="muted sisayksikko-schematic-empty">
        Valitse kattokasetti, seinä- tai kanavoitava tyyppi nähdäksesi kuvan ja lämpötilat.
      </p>
    );
  }

  const positions = sisayksikkoOverlayPositions(unit.tyyppi);
  const temps = sisayksikkoTempOverlay(unit, mittaus);

  return (
    <div className={`sisayksikko-schematic-preview${className ? ` ${className}` : ''}`}>
      <img
        className="sisayksikko-schematic-img"
        src={sisayksikkoImageUrl(unit.tyyppi)}
        alt=""
      />
      {temps.huone ? (
        <div className="sisayksikko-schematic-chip" style={overlayStyle(positions.huone)}>
          Huone {temps.huone}
        </div>
      ) : null}
      {temps.puhallus ? (
        <div className="sisayksikko-schematic-chip" style={overlayStyle(positions.puhallus)}>
          Puhallus {temps.puhallus}
        </div>
      ) : null}
      {temps.paluu ? (
        <div className="sisayksikko-schematic-chip" style={overlayStyle(positions.paluu)}>
          Paluu {temps.paluu}
        </div>
      ) : null}
    </div>
  );
}
