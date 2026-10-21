interface SettingsFooterProps {
    t: (key: string) => string;
    appVersion: string;
}

const SettingsFooter = ({
    t,
    appVersion,
}: SettingsFooterProps) => {
    return (
        <>
            {/* Version Info */}
            <div style={{
                marginTop: '16px',
                marginBottom: '32px',
                textAlign: 'center',
                opacity: 1
            }}>
                <div style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    letterSpacing: '0.5px',
                    marginBottom: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                }}>
                    <span>Axiom {appVersion ? `v${appVersion}` : "v0.2.0"}</span>
                </div>
                <div style={{
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                    marginBottom: '4px'
                }}>
                    {t('slogan')}
                </div>
            </div>
        </>
    );
};

export default SettingsFooter;
