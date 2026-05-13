      {!isFocusMode && (
        <div className="sticky-controls">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: compactMode ? 10 : 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: compactMode ? '1.1rem' : '1.4rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
                🔍 Command Center
                <span style={{ fontSize: '0.65rem', padding: '3px 8px', background: 'var(--brand-glow)', color: 'var(--brand)', borderRadius: '12px', border: '1px solid var(--brand)', letterSpacing: '0.05em' }}>v1.8.0: SKU & TOOLTIP LIVE</span>
              </h2>
              {!compactMode && <p style={{ margin: '4px 0 0', opacity: 0.6 }}>Advanced search, filter, and logistics management</p>}
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={runSearch}>🔄 Run Search</button>
            </div>
          </div>

          <SearchFilters
            preset={preset} setPreset={setPreset}
            customStart={customStart} setCustomStart={setCustomStart}
            customEnd={customEnd} setCustomEnd={setCustomEnd}
            status={status} setStatus={setStatus}
            keyword={keyword} setKeyword={setKeyword}
            sort={sort} setSort={setSort}
            selectedView={selectedView} loadView={loadView}
            deleteView={deleteView}
            savedViews={savedViews}
            runSearch={runSearch}
            setColFilters={setColFilters}
            setActiveAgingBucket={setActiveAgingBucket}
            addToast={addToast}
            compactMode={compactMode}
            toggleCompact={toggleCompact}
            toggleAgingBar={toggleAgingBar}
            showAgingBar={showAgingBar}
            setShowAgingConfig={setShowAgingConfig}
            syncProgress={syncProgress}
            kpi={kpi}
            deliveryRate={deliveryRate}
            missingCostCount={missingCostCount}
            activeAgingBucket={activeAgingBucket}
            agingBuckets={agingBuckets}
            agingCounts={agingCounts}
            DATE_PRESETS={DATE_PRESETS}
            STATUS_OPTIONS={STATUS_OPTIONS}
            SORT_OPTIONS={SORT_OPTIONS}
            setShowSaveDialog={setShowSaveDialog}
            setShowColPicker={setShowColPicker}
            setShowNameDialog={setShowNameDialog}
            sortMode={sortMode}
            setSortMode={setSortMode}
            showKPIs={showKPIs}
            toggleKPIs={toggleKPIs}
          />
        </div>
      )}
