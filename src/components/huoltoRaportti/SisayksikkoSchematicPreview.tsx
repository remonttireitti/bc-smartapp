import type { CSSProperties } from 'react';
import {
  sisayksikkoImageUrl,
  sisayksikkoOverlayPositions,
  sisayksikkoPaineOverlay,
  sisayksikkoSupportsSchematic,
  sisayksikkoTempOverlay,
} from '../../lib/huoltoRaportti/sisayksikkoTypes';
import type { MittausSisayksikkoData, SisayksikkoData } from '../../lib/huoltoRaportti/types';

interface Props {
  unit: Pick<SisayksikkoData, 'tyyppi' | 'huoneLampotila'>;
  mittaus?: Pick<
    MittausSisayksikkoData,
    | 'sisalampotila'
    | 'puhallusLampotila'
    | 'paluuLampotila'
    | 'imupaineJaahdytys'
    | 'korkeapaineJaahdytys'
    | 'imupaineLammitys'
    | 'korkeapaineLammitys'
  >;
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

function columnStyle(anchor: { top?: string; bottom?: string; left?: string; right?: string }): CSSProperties {
  return {
    ...overlayStyle(anchor),
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    alignItems: 'flex-start',
    maxWidth: '48%',
  };
}

export function SisayksikkoSchematicPreview({ unit, mittaus, className }: Props) {
  if (!sisayksikkoSupportsSchematic(unit.tyyppi)) {
    return (
      <p className="muted sisayksikko-schematic-empty">
        Valitse kattokasetti, seinä- tai kanavoitava tyyppi nähdäksesi kuvan ja mittaukset.
      </p>
    );
  }

  const positions = sisayksikkoOverlayPositions(unit.tyyppi);
  const temps = sisayksikkoTempOverlay(unit, mittaus);
  const paineet = sisayksikkoPaineOverlay(mittaus);
  const paineLines = [
    paineet.imuJ ? `Imu (J) ${paineet.imuJ}` : null,
    paineet.kpJ ? `KP (J) ${paineet.kpJ}` : null,
    paineet.imuL ? `Imu (L) ${paineet.imuL}` : null,
    paineet.kpL ? `KP (L) ${paineet.kpL}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className={`sisayksikko-schematic-preview${className ? ` ${className}` : ''}`}>
      <img
        className="sisayksikko-schematic-img"
        src={sisayksikkoImageUrl(unit.tyyppi)}
        alt=""
      />
      {paineLines.length > 0 ? (
        <div className="sisayksikko-schematic-column" style={columnStyle(positions.paineet)}>
          {paineLines.map((line) => (
            <div key={line} className="sisayksikko-schematic-chip">{line}</div>
          ))}
        </div>
      ) : null}
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
