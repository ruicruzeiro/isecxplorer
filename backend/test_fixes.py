"""
Tests for the K-Means driven badge assignment flow.

Run locally with:
    python test_fixes.py

These tests use only two realistic sessions so the debug clustering flow can be
checked before adding more users.
"""

import sys
import types
import unittest
from unittest.mock import MagicMock, patch

import performance_clustering as clustering


def _cluster_summary():
    return [
        {
            "cluster_id": 0,
            "count": 1,
            "avg_score": 1150,
            "avg_duration_s": 1500,
            "avg_normalized_time": 0.379,
            "avg_quiz_accuracy": 0.364,
            "avg_quiz_time_s": 13.64,
            "avg_distance_m": 1300,
            "avg_stops_count": 1,
            "avg_completion_rate": 1.0,
        },
        {
            "cluster_id": 1,
            "count": 1,
            "avg_score": 1700,
            "avg_duration_s": 2200,
            "avg_normalized_time": 0.556,
            "avg_quiz_accuracy": 0.955,
            "avg_quiz_time_s": 10,
            "avg_distance_m": 1500,
            "avg_stops_count": 1,
            "avg_completion_rate": 1.0,
        },
    ]


def _session_rows():
    return [
        {
            "session_uuid": "11111111-1111-1111-1111-111111111111",
            "player_alias": "Rodrigo",
            "score": 1150,
            "duration_s": 1500,
            "pois_count": 22,
            "quiz_correct": 8,
            "quiz_total": 22,
            "quiz_time_total_s": 300,
            "distance_m": 1300,
            "stops_count": 1,
            "total_pois": clustering.TOTAL_POIS,
        },
        {
            "session_uuid": "22222222-2222-2222-2222-222222222222",
            "player_alias": "Mariana",
            "score": 1700,
            "duration_s": 2200,
            "pois_count": 22,
            "quiz_correct": 21,
            "quiz_total": 22,
            "quiz_time_total_s": 220,
            "distance_m": 1500,
            "stops_count": 1,
            "total_pois": clustering.TOTAL_POIS,
        },
    ]


def _fake_ml_modules():
    fake_np = types.SimpleNamespace(array=lambda data, dtype=float: data)
    fake_sklearn = types.ModuleType("sklearn")
    fake_cluster = types.ModuleType("sklearn.cluster")
    fake_preprocessing = types.ModuleType("sklearn.preprocessing")

    class FakeScaler:
        def fit_transform(self, X):
            return X

    class FakeKMeans:
        def __init__(self, n_clusters, random_state=None, n_init=None):
            self.n_clusters = n_clusters

        def fit_predict(self, X):
            return [index % self.n_clusters for index in range(len(X))]

    fake_cluster.KMeans = FakeKMeans
    fake_preprocessing.StandardScaler = FakeScaler

    return {
        "numpy": fake_np,
        "sklearn": fake_sklearn,
        "sklearn.cluster": fake_cluster,
        "sklearn.preprocessing": fake_preprocessing,
    }


class TestClusterBadgeInterpretation(unittest.TestCase):
    def test_assigns_badges_to_two_realistic_profiles(self):
        badges = clustering._assign_cluster_badges(_cluster_summary())

        self.assertEqual(
            badges,
            {
                0: "speedrunner",
                1: "quiz_master",
            },
        )

    def test_session_to_features_uses_numeric_ml_features(self):
        row = _session_rows()[0]
        features = clustering._session_to_features(row)

        self.assertEqual(len(features), 8)
        self.assertEqual(features[0], float(row["score"]))
        self.assertAlmostEqual(features[-1], row["pois_count"] / clustering.TOTAL_POIS)


class TestKMeansBadgeFlow(unittest.TestCase):
    def test_normal_recompute_still_requires_more_than_two_sessions(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_cursor.fetchall.return_value = _session_rows()

        with patch.dict(sys.modules, _fake_ml_modules()):
            with patch("performance_clustering.get_connection", return_value=mock_conn):
                result = clustering.recompute_performance_clusters(
                    n_clusters=5,
                    update_badges=True,
                    force=True,
                )

        self.assertFalse(result["ok"])
        self.assertEqual(result["reason"], "not_enough_sessions_for_reliable_kmeans")
        self.assertEqual(result["sessions"], 2)
        self.assertEqual(result["required"], 15)

    def test_debug_recompute_still_requires_two_sessions(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_cursor.fetchall.return_value = _session_rows()[:1]

        with patch.dict(sys.modules, _fake_ml_modules()):
            with patch("performance_clustering.get_connection", return_value=mock_conn):
                result = clustering.recompute_performance_clusters(
                    n_clusters=2,
                    update_badges=True,
                    force=True,
                    debug_mode=True,
                )

        self.assertFalse(result["ok"])
        self.assertEqual(result["reason"], "not_enough_sessions_for_reliable_kmeans")
        self.assertEqual(result["sessions"], 1)
        self.assertEqual(result["required"], 2)
        self.assertTrue(result["debug_mode"])

    def test_debug_recompute_runs_with_two_realistic_users(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_cursor.fetchall.return_value = _session_rows()

        with patch.dict(sys.modules, _fake_ml_modules()):
            with patch("performance_clustering.get_connection", return_value=mock_conn):
                result = clustering.recompute_performance_clusters(
                    n_clusters=2,
                    update_badges=True,
                    force=True,
                    debug_mode=True,
                )

        self.assertTrue(result["ok"])
        self.assertEqual(result["sessions"], 2)
        self.assertEqual(result["n_clusters"], 2)
        self.assertEqual(result["minimum_sessions"], 2)
        self.assertTrue(result["debug_mode"])

        update_calls = mock_cursor.execute.call_args_list[1:]
        self.assertEqual(len(update_calls), 2)

        first_update_sql = update_calls[0].args[0]
        first_update_params = update_calls[0].args[1]

        self.assertIn("badge = %s", first_update_sql)
        self.assertEqual(first_update_params[0], 0)
        self.assertEqual(first_update_params[1], "fast_players")
        self.assertEqual(first_update_params[2], "speedrunner")


if __name__ == "__main__":
    unittest.main(verbosity=2)
