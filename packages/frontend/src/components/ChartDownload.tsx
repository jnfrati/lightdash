import {
    Button,
    Divider,
    FormGroup,
    HTMLSelect,
    Intent,
    PopoverPosition,
} from '@blueprintjs/core';
import { Classes, Popover2 } from '@blueprintjs/popover2';
import {
    ChartType,
    getCustomLabelsFromColumnProperties,
} from '@lightdash/common';
import EChartsReact from 'echarts-for-react';
import JsPDF from 'jspdf';
import React, { memo, RefObject, useCallback, useState } from 'react';
import useEcharts from '../hooks/echarts/useEcharts';
import ExportCSV from './ExportCSV';
import { useVisualizationContext } from './LightdashVisualization/VisualizationProvider';

const FILE_NAME = 'lightdash_chart';

enum DownloadType {
    JPEG = 'JPEG',
    PNG = 'PNG',
    SVG = 'SVG',
    PDF = 'PDF',
    JSON = 'JSON',
}

async function base64SvgToBase64Image(
    originalBase64: string,
    width: number,
    type: 'jpeg' | 'png' = 'png',
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = document.createElement('img');
        img.onload = () => {
            document.body.appendChild(img);
            const canvas = document.createElement('canvas');
            const ratio = img.clientWidth / img.clientHeight || 1;
            document.body.removeChild(img);
            canvas.width = width;
            canvas.height = width / ratio;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                if (type === 'jpeg') {
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                try {
                    const data = canvas.toDataURL(`image/${type}`);
                    resolve(data);
                } catch (e: any) {
                    reject();
                }
            } else {
                reject();
            }
        };
        img.src = originalBase64;
    });
}

function downloadImage(base64: string) {
    const link = document.createElement('a');
    link.href = base64;
    link.download = FILE_NAME;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadJson(object: Object) {
    const data = JSON.stringify(object);
    const blob = new Blob([data], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${FILE_NAME}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadPdf(base64: string, width: number, height: number) {
    const padding: number = 20;
    let doc: JsPDF;
    if (width > height) {
        doc = new JsPDF('l', 'mm', [width + padding * 2, height + padding * 2]);
    } else {
        doc = new JsPDF('p', 'mm', [height + padding * 2, width + padding * 2]);
    }
    doc.addImage({
        imageData: base64,
        x: padding,
        y: padding,
        width,
        height,
    });
    doc.save(FILE_NAME);
}

type DownloadOptions = {
    chartRef: RefObject<EChartsReact>;
    chartType: ChartType;
};
export const ChartDownloadOptions: React.FC<DownloadOptions> = ({
    chartRef,
    chartType,
}) => {
    const [type, setType] = useState<DownloadType>(DownloadType.JPEG);
    const isTable = chartType === ChartType.TABLE;
    const onDownload = useCallback(async () => {
        const echartsInstance = chartRef.current?.getEchartsInstance();

        if (!echartsInstance) {
            throw new Error('Chart instance not reachable');
        }

        const svgBase64 = echartsInstance.getDataURL();
        const width = echartsInstance.getWidth();
        const height = echartsInstance.getHeight();

        switch (type) {
            case DownloadType.PDF:
                downloadPdf(
                    await base64SvgToBase64Image(svgBase64, width),
                    width,
                    height,
                );
                break;
            case DownloadType.SVG:
                downloadImage(svgBase64);
                break;
            case DownloadType.JPEG:
                downloadImage(
                    await base64SvgToBase64Image(svgBase64, width, 'jpeg'),
                );
                break;
            case DownloadType.PNG:
                downloadImage(await base64SvgToBase64Image(svgBase64, width));
                break;
            case DownloadType.JSON:
                downloadJson(echartsInstance.getOption());
                break;
            default: {
                const never: never = type;
                throw new Error(`Unexpected download type: ${type}`);
            }
        }
    }, [chartRef, type]);

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
            }}
        >
            <span>
                <b>Options</b>
            </span>
            <Divider />

            <FormGroup label="File format" labelFor="download-type" inline>
                <HTMLSelect
                    id="download-type"
                    value={type}
                    onChange={(e) =>
                        setType(e.currentTarget.value as DownloadType)
                    }
                    options={Object.values(DownloadType).map(
                        (downloadType) => ({
                            value: downloadType,
                            label: downloadType,
                        }),
                    )}
                />
            </FormGroup>
            <Divider />
            {!isTable && (
                <Button
                    style={{ alignSelf: 'flex-end' }}
                    intent={Intent.PRIMARY}
                    icon="cloud-download"
                    text="Download"
                    onClick={onDownload}
                />
            )}
        </div>
    );
};

interface ChartDownloadMenuProps {
    getCsvLink?: (
        limit: number | null,
        onlyRaw: boolean,
        showTableNames: boolean,
        columnOrder: string[],
        customLabels?: Record<string, string>,
    ) => Promise<string>;
}

export const ChartDownloadMenu: React.FC<ChartDownloadMenuProps> = memo(
    ({ getCsvLink }) => {
        const {
            chartRef,
            chartType,
            tableConfig: {
                showTableNames,
                columnProperties,
                rows,
                columnOrder,
            },
            resultsData,
        } = useVisualizationContext();
        const eChartsOptions = useEcharts();
        const [isOpen, setIsOpen] = useState(false);
        const disabled =
            (chartType === ChartType.TABLE && rows.length <= 0) ||
            !resultsData?.metricQuery ||
            chartType === ChartType.BIG_NUMBER ||
            (chartType === ChartType.CARTESIAN && !eChartsOptions);

        return chartType === ChartType.TABLE && getCsvLink ? (
            <Popover2
                lazy
                position={PopoverPosition.BOTTOM_LEFT}
                popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
                content={
                    <ExportCSV
                        getCsvLink={async (
                            limit: number | null,
                            onlyRaw: boolean,
                        ) =>
                            getCsvLink(
                                limit,
                                onlyRaw,
                                showTableNames,
                                columnOrder,
                                getCustomLabelsFromColumnProperties(
                                    columnProperties,
                                ),
                            )
                        }
                        rows={rows}
                    />
                }
            >
                <Button text="Export CSV" rightIcon="caret-down" minimal />
            </Popover2>
        ) : chartType === ChartType.TABLE && !getCsvLink ? null : (
            <Popover2
                lazy
                content={
                    <ChartDownloadOptions
                        chartRef={chartRef}
                        chartType={chartType}
                    />
                }
                popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
                isOpen={isOpen}
                onInteraction={setIsOpen}
                position={PopoverPosition.BOTTOM_LEFT}
                disabled={disabled}
            >
                <Button
                    minimal
                    rightIcon="caret-down"
                    text="Export as"
                    disabled={disabled}
                />
            </Popover2>
        );
    },
);
